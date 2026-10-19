// MOCK BACKEND — workflow operations.
//
// Each operation re-checks permission, ownership, workflow transition and
// version consistency, mirroring what the production backend must enforce.
// Used both by the mock HTTP router and by the seed script (with simulated time).

import { ApiError } from '@/services/apiError';
import { validateWorkbook } from '@/features/validation/engine';
import { can, canTransition, manualTestBlockers, NEW_VERSION_STAGES, submissionBlockers, VALIDATABLE_STAGES, type PermissionAction } from '@/features/workflow/workflow';
import type {
  AuditAction,
  DocumentType,
  EngDocument,
  ManualResult,
  ManualTestSession,
  ParsedWorkbook,
  User,
  ValidationReport,
  WorkbookMeta,
  WorkflowStage,
} from '@/types';
import { type DbState, fileKey, fileStore, nextId } from './db';
import { documentTypeRequirement, manualTestTemplate, projects, requirements, users, vendors } from './data/reference';
import { generateSampleWorkbook, hashSeed } from './sampleWorkbooks';

const TYPE_ABBR: Record<DocumentType, string> = {
  equipment_data_sheet: 'EDS',
  pipeline_inspection: 'PIM',
  pressure_vessel_spec: 'PVS',
  instrumentation_data: 'INS',
  maintenance_records: 'MNT',
};

export function findDoc(s: DbState, id: string) {
  const doc = s.documents.find((d) => d.id === id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
  return doc;
}

export function authorize(actor: User, action: PermissionAction, doc?: EngDocument) {
  if (!can(actor, action, doc)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action on this document.');
  }
}

function setStage(doc: EngDocument, to: WorkflowStage) {
  if (!canTransition(doc.stage, to)) {
    throw new ApiError(409, 'CONFLICT', `Invalid workflow transition from “${doc.stage}” to “${to}”.`);
  }
  doc.stage = to;
}

export function audit(s: DbState, actor: User, action: AuditAction, detail: string, at: Date, doc?: EngDocument | null, outcome: 'success' | 'denied' = 'success') {
  s.audit.unshift({
    id: nextId(s, 'ev'),
    documentId: doc?.id ?? null,
    docNumber: doc?.docNumber ?? null,
    versionNo: doc?.currentVersion ?? null,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    detail,
    outcome,
    at: at.toISOString(),
  });
  if (s.audit.length > 2000) s.audit.length = 2000;
}

function notify(s: DbState, userId: string, title: string, body: string, doc: EngDocument, link: string, at: Date) {
  s.notifications.unshift({ id: nextId(s, 'nt'), userId, title, body, documentId: doc.id, link, read: false, createdAt: at.toISOString() });
}

const currentVersion = (doc: EngDocument) => doc.versions.find((v) => v.versionNo === doc.currentVersion)!;
export const latestReport = (s: DbState, doc: EngDocument) => (doc.latestReportId ? s.reports.find((r) => r.id === doc.latestReportId) ?? null : null);

function blankManualSession(versionNo: number, at: Date): ManualTestSession {
  return {
    versionNo,
    testerName: '',
    testDate: at.toISOString().slice(0, 10),
    items: manualTestTemplate.map((t) => ({ ...t, result: null, comment: '' })),
    observations: '',
    evidence: [],
    status: 'not_started',
    updatedAt: at.toISOString(),
  };
}

function resetForNewVersion(doc: EngDocument) {
  doc.validationStatus = 'not_started';
  doc.manualTestStatus = 'not_started';
  doc.approvalStatus = 'not_submitted';
  doc.vendorStatus = 'not_ready';
  doc.latestReportId = null;
}

// ---------------------------------------------------------------------------

export interface CreateDocumentInput {
  title: string;
  projectId: string;
  assetId: string;
  type: DocumentType;
  revision: string;
  changeNote: string;
  file: WorkbookMeta;
}

export function createDocument(s: DbState, actor: User, input: CreateDocumentInput, workbook: ParsedWorkbook | null, now: Date): EngDocument {
  authorize(actor, 'document.create');
  const project = projects.find((p) => p.id === input.projectId);
  if (!project || !actor.projectIds.includes(project.id)) throw new ApiError(403, 'FORBIDDEN', 'You are not a member of the selected project.');
  if (!project.assets.some((a) => a.id === input.assetId)) throw new ApiError(422, 'VALIDATION', 'Selected asset does not belong to the project.');
  const requirementId = documentTypeRequirement[input.type];
  if (!requirementId) throw new ApiError(422, 'VALIDATION', 'Unsupported document type.');

  const count = s.documents.filter((d) => d.projectId === project.id && d.type === input.type).length + 1;
  const doc: EngDocument = {
    id: nextId(s, 'doc'),
    docNumber: `${project.code}-${TYPE_ABBR[input.type]}-${String(count).padStart(4, '0')}`,
    title: input.title.trim().slice(0, 160),
    projectId: project.id,
    assetId: input.assetId,
    type: input.type,
    requirementId,
    ownerId: actor.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    currentVersion: 1,
    stage: 'draft',
    validationStatus: 'not_started',
    manualTestStatus: 'not_started',
    approvalStatus: 'not_submitted',
    vendorStatus: 'not_ready',
    latestReportId: null,
    versions: [
      { versionNo: 1, revision: input.revision.trim(), uploadedAt: now.toISOString(), uploadedBy: actor.id, file: input.file, changeNote: input.changeNote.trim().slice(0, 500), reportIds: [] },
    ],
    manualTests: {},
    submissions: [],
    approvals: [],
    vendorSubmissions: [],
  };
  s.documents.unshift(doc);
  audit(s, actor, 'document_created', `Draft created for ${doc.title}`, now, doc);
  setStage(doc, 'uploaded');
  if (workbook) fileStore.set(fileKey(doc.id, 1), workbook);
  audit(s, actor, 'file_uploaded', `Uploaded ${input.file.fileName} (${input.revision})`, now, doc);
  return doc;
}

export function uploadVersion(s: DbState, actor: User, docId: string, input: { revision: string; changeNote: string; file: WorkbookMeta }, workbook: ParsedWorkbook | null, now: Date) {
  const doc = findDoc(s, docId);
  authorize(actor, 'document.upload_version', doc);
  if (!NEW_VERSION_STAGES.includes(doc.stage)) {
    throw new ApiError(409, 'CONFLICT', 'A new version cannot be uploaded while the document is awaiting approval or vendor handover.');
  }
  if (doc.versions.some((v) => v.revision.toLowerCase() === input.revision.trim().toLowerCase())) {
    throw new ApiError(422, 'VALIDATION', `Revision “${input.revision}” already exists for this document.`);
  }
  setStage(doc, 'uploaded');
  const versionNo = doc.currentVersion + 1;
  doc.versions.push({ versionNo, revision: input.revision.trim(), uploadedAt: now.toISOString(), uploadedBy: actor.id, file: input.file, changeNote: input.changeNote.trim().slice(0, 500), reportIds: [] });
  doc.currentVersion = versionNo;
  resetForNewVersion(doc);
  doc.updatedAt = now.toISOString();
  if (workbook) fileStore.set(fileKey(doc.id, versionNo), workbook);
  audit(s, actor, 'new_version_uploaded', `Version ${versionNo} (${input.revision}) uploaded: ${input.file.fileName}`, now, doc);
  return doc;
}

export function runValidation(s: DbState, actor: User, docId: string, input: { sheets?: string[]; useSynthetic?: boolean }, now: Date): ValidationReport {
  const doc = findDoc(s, docId);
  authorize(actor, 'document.validate', doc);
  if (!VALIDATABLE_STAGES.includes(doc.stage)) throw new ApiError(409, 'CONFLICT', 'Validation cannot be run at the current workflow stage.');
  const version = currentVersion(doc);
  const req = requirements.find((r) => r.id === doc.requirementId)!;

  let workbook = fileStore.get(fileKey(doc.id, version.versionNo)) ?? null;
  let synthetic = false;
  if (!workbook) {
    if (!version.file.synthetic && !input.useSynthetic) {
      throw new ApiError(410, 'FILE_UNAVAILABLE', 'The workbook contents are no longer in browser memory (they are never written to browser storage). Upload the file again or run against the synthetic sample dataset.');
    }
    const profile = version.file.sampleProfile ?? (version.versionNo === 1 ? 'dirty' : 'clean');
    workbook = generateSampleWorkbook(doc.type, profile, hashSeed(doc.id + version.versionNo));
    synthetic = true;
  }

  setStage(doc, 'validation_in_progress');
  doc.validationStatus = 'in_progress';
  audit(s, actor, 'validation_started', `Automated validation started against ${req.code} ${req.version}`, now, doc);

  const sheets = input.sheets?.length ? input.sheets : undefined;
  const result = validateWorkbook(req, workbook, sheets);
  const report: ValidationReport = {
    id: nextId(s, 'rpt'),
    documentId: doc.id,
    versionNo: version.versionNo,
    revision: version.revision,
    requirementId: req.id,
    requirementCode: req.code,
    requirementVersion: req.version,
    runAt: new Date(now.getTime() + 90_000).toISOString(),
    runBy: actor.id,
    scope: result.scope,
    sheetsValidated: result.sheetsValidated,
    synthetic,
    totals: result.totals,
    bySheet: result.bySheet,
    byCategory: result.byCategory,
    overall: result.overall,
    findings: result.findings,
    passedRules: result.passedRules,
    rowSnapshots: result.rowSnapshots,
  };
  s.reports.unshift(report);
  version.reportIds.push(report.id);
  doc.latestReportId = report.id;
  doc.validationStatus = result.overall;
  setStage(doc, result.overall === 'failed' ? 'validation_failed' : 'validation_passed');
  // A re-run invalidates any manual testing recorded against an earlier report.
  if (doc.manualTests[version.versionNo]?.status === 'completed') {
    doc.manualTests[version.versionNo].status = 'in_progress';
  }
  doc.manualTestStatus = doc.manualTests[version.versionNo] ? doc.manualTests[version.versionNo].status : 'not_started';
  doc.updatedAt = report.runAt;
  const t = result.totals;
  audit(s, actor, 'validation_completed', `Validation ${result.overall.replace(/_/g, ' ')} — ${t.passedChecks} passed, ${t.failedChecks} failed, ${t.warningChecks} warnings (${t.failingRows} failing rows)${result.scope === 'partial' ? ' [partial scope]' : ''}`, new Date(report.runAt), doc);
  return report;
}

export interface ManualTestInput {
  testerName: string;
  testDate: string;
  items: { id: string; result: ManualResult | null; comment: string }[];
  observations: string;
  evidence: { name: string; size: number }[];
  deviation?: { acknowledged: boolean; justification: string };
  complete: boolean;
}

export function saveManualTest(s: DbState, actor: User, docId: string, input: ManualTestInput, now: Date) {
  const doc = findDoc(s, docId);
  authorize(actor, 'document.manual_test', doc);
  const report = latestReport(s, doc);
  const blockers = manualTestBlockers(doc, report);
  if (blockers.length) throw new ApiError(409, 'CONFLICT', blockers[0], blockers);

  const existing = doc.manualTests[doc.currentVersion] ?? blankManualSession(doc.currentVersion, now);
  // Item definitions come from the server-side template, never from the client payload.
  const items = manualTestTemplate.map((t) => {
    const incoming = input.items.find((i) => i.id === t.id);
    return { ...t, result: incoming?.result ?? null, comment: (incoming?.comment ?? '').slice(0, 1000) };
  });
  const session: ManualTestSession = {
    ...existing,
    testerName: input.testerName.trim().slice(0, 120),
    testDate: input.testDate,
    items,
    observations: input.observations.slice(0, 4000),
    evidence: input.evidence.slice(0, 10).map((e) => ({ name: e.name.slice(0, 200), size: e.size })),
    deviation: input.deviation ? { acknowledged: !!input.deviation.acknowledged, justification: input.deviation.justification.slice(0, 2000) } : undefined,
    updatedAt: now.toISOString(),
  };

  if (input.complete) {
    const problems: string[] = [];
    if (!session.testerName) problems.push('Tester name is required.');
    for (const i of items) {
      if (i.required && i.result === null) problems.push(`${i.id}: result required.`);
      if (i.result === 'fail' && !i.comment.trim()) problems.push(`${i.id}: a comment is required for failed tests.`);
      if (i.required && i.result === 'na' && !i.comment.trim()) problems.push(`${i.id}: justification is required when a mandatory test is marked N/A.`);
    }
    if (problems.length) throw new ApiError(422, 'VALIDATION', 'Manual testing is incomplete.', problems);
    const anyFail = items.some((i) => i.result === 'fail');
    session.status = anyFail ? 'failed' : 'completed';
    session.completedAt = now.toISOString();
    if (doc.stage !== 'manual_testing') setStage(doc, 'manual_testing');
    if (!anyFail) setStage(doc, 'ready_for_review');
    audit(s, actor, 'manual_testing_completed', anyFail ? `Manual testing completed with ${items.filter((i) => i.result === 'fail').length} failed test(s)` : 'Manual testing completed — all required checks passed', now, doc);
  } else {
    session.status = 'in_progress';
    session.completedAt = undefined;
    setStage(doc, 'manual_testing');
    audit(s, actor, 'manual_testing_saved', `Manual testing progress saved (${items.filter((i) => i.result).length}/${items.length} answered)`, now, doc);
  }
  doc.manualTests[doc.currentVersion] = session;
  doc.manualTestStatus = session.status;
  doc.updatedAt = now.toISOString();
  return doc;
}

export function submitForApproval(s: DbState, actor: User, docId: string, input: { comment: string }, now: Date) {
  const doc = findDoc(s, docId);
  authorize(actor, 'document.submit', doc);
  const report = latestReport(s, doc);
  const session = doc.manualTests[doc.currentVersion];
  const blockers = submissionBlockers(doc, report, session);
  if (blockers.length) throw new ApiError(409, 'CONFLICT', 'Document is not eligible for submission.', blockers);
  setStage(doc, 'pending_approval');
  doc.approvalStatus = 'pending';
  const version = currentVersion(doc);
  const deviationRequested = !!report && report.totals.failedChecks > 0;
  doc.submissions.push({ versionNo: version.versionNo, revision: version.revision, submittedAt: now.toISOString(), submittedBy: actor.id, comment: input.comment.trim().slice(0, 2000), deviationRequested });
  doc.updatedAt = now.toISOString();
  audit(s, actor, 'submitted_for_approval', `Submitted ${version.revision} for Responsible Engineer approval${deviationRequested ? ' with deviation request' : ''}`, now, doc);
  for (const m of users.filter((u) => u.role === 'manager' && u.projectIds.includes(doc.projectId))) {
    notify(s, m.id, 'Document awaiting approval', `${actor.name} submitted ${doc.docNumber} ${version.revision}`, doc, `/review/${doc.id}`, now);
  }
  return doc;
}

export function decide(s: DbState, actor: User, docId: string, input: { decision: 'approved' | 'changes_requested'; comment: string; versionNo: number }, now: Date) {
  const doc = findDoc(s, docId);
  authorize(actor, input.decision === 'approved' ? 'document.approve' : 'document.request_changes', doc);
  if (doc.stage !== 'pending_approval') throw new ApiError(409, 'CONFLICT', 'This document is not awaiting approval (it may already have been decided by another reviewer).');
  if (input.versionNo !== doc.currentVersion) throw new ApiError(409, 'CONFLICT', 'The document version has changed since you opened it. Reload and review the current version.');
  const comment = input.comment.trim();
  if (input.decision === 'changes_requested' && comment.length < 10) throw new ApiError(422, 'VALIDATION', 'A rejection reason of at least 10 characters is required.');

  const report = latestReport(s, doc);
  const version = currentVersion(doc);
  if (input.decision === 'approved') {
    // Defence in depth: never approve over critical failures or incomplete testing.
    const session = doc.manualTests[doc.currentVersion];
    if (!report || report.versionNo !== doc.currentVersion || report.totals.criticalFailures > 0 || session?.status !== 'completed') {
      throw new ApiError(409, 'CONFLICT', 'Approval blocked: validation or manual testing for this version is not in an approvable state.');
    }
  }
  doc.approvals.push({ id: nextId(s, 'apr'), versionNo: version.versionNo, revision: version.revision, reportId: report?.id ?? null, decision: input.decision, comment: comment.slice(0, 2000), reviewerId: actor.id, reviewerName: actor.name, decidedAt: now.toISOString() });
  doc.updatedAt = now.toISOString();
  if (input.decision === 'approved') {
    setStage(doc, 'approved');
    doc.approvalStatus = 'approved';
    audit(s, actor, 'approved', `Approved ${version.revision} (report ${report?.id})${comment ? `: “${comment.slice(0, 120)}”` : ''}`, now, doc);
    setStage(doc, 'vendor_ready');
    doc.vendorStatus = 'ready';
    audit(s, actor, 'moved_to_vendor_ready', 'Moved to vendor submission stage', now, doc);
    notify(s, doc.ownerId, 'Document approved', `${doc.docNumber} ${version.revision} approved by ${actor.name}`, doc, `/documents/${doc.id}`, now);
  } else {
    setStage(doc, 'changes_requested');
    doc.approvalStatus = 'changes_requested';
    audit(s, actor, 'changes_requested', `Changes requested on ${version.revision}: “${comment.slice(0, 160)}”`, now, doc);
    notify(s, doc.ownerId, 'Changes requested', `${actor.name}: ${comment.slice(0, 90)}`, doc, `/documents/${doc.id}`, now);
  }
  return doc;
}

export interface VendorSubmitInput {
  versionNo: number;
  vendorId: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  packageItems: string[];
}

export function vendorSubmit(s: DbState, actor: User, docId: string, input: VendorSubmitInput, now: Date) {
  const doc = findDoc(s, docId);
  authorize(actor, 'document.vendor_submit', doc);
  if (doc.stage !== 'vendor_ready') throw new ApiError(409, 'CONFLICT', 'Document is not ready for vendor submission.');
  if (input.versionNo !== doc.currentVersion) throw new ApiError(409, 'CONFLICT', 'Version mismatch — reload the handover page.');
  const approval = [...doc.approvals].reverse().find((a) => a.versionNo === doc.currentVersion);
  if (approval?.decision !== 'approved') throw new ApiError(409, 'CONFLICT', 'Explicit Responsible Engineer approval of this version is required before vendor submission.');
  const vendor = vendors.find((v) => v.id === input.vendorId);
  if (!vendor) throw new ApiError(422, 'VALIDATION', 'Unknown vendor.');
  const version = currentVersion(doc);
  const project = projects.find((p) => p.id === doc.projectId)!;
  setStage(doc, 'vendor_submitted');
  doc.vendorStatus = 'submitted';
  const transmittalNo = `TRN-${project.code}-${String(s.seq + 1).slice(-4)}`;
  doc.vendorSubmissions.push({
    versionNo: version.versionNo,
    revision: version.revision,
    vendorId: vendor.id,
    vendorName: vendor.name,
    contactName: input.contactName.trim().slice(0, 120),
    contactEmail: input.contactEmail.trim().slice(0, 200),
    transmittalNo,
    packageItems: input.packageItems.slice(0, 20),
    notes: input.notes.slice(0, 2000),
    submittedAt: now.toISOString(),
    submittedBy: actor.id,
  });
  s.seq += 1;
  doc.updatedAt = now.toISOString();
  audit(s, actor, 'vendor_submitted', `Transmittal ${transmittalNo} issued to ${vendor.name} (simulated)`, now, doc);
  notify(s, doc.ownerId, 'Submitted to vendor', `${doc.docNumber} ${version.revision} sent to ${vendor.name}`, doc, `/documents/${doc.id}`, now);
  return doc;
}

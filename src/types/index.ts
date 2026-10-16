// Shared domain models for the DIPA prototype.
// These types describe the API contract between the UI and the (mock) backend.

export type Role = 'engineer' | 'manager';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  initials: string;
  projectIds: string[];
}

export interface Session {
  user: User;
  /** ISO timestamp. In production the session lives in an HttpOnly cookie; this is display-only. */
  expiresAt: string;
  mock: true;
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  type: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  location: string;
  phase: string;
  assets: Asset[];
}

export type DocumentType =
  | 'equipment_data_sheet'
  | 'pipeline_inspection'
  | 'pressure_vessel_spec'
  | 'instrumentation_data'
  | 'maintenance_records';

// ---------------------------------------------------------------------------
// Requirement documents & rules
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'major' | 'minor';

export type ValidationCategory =
  | 'required_structure'
  | 'required_field'
  | 'missing_value'
  | 'data_type'
  | 'allowed_value'
  | 'range'
  | 'duplicate'
  | 'cross_field'
  | 'unit';

export type ColumnDataType = 'string' | 'number' | 'date' | 'enum';

export interface ColumnSpec {
  /** Rule identifier root, e.g. EDS-C03. Individual checks append a suffix. */
  ruleId: string;
  sheet: string;
  header: string;
  type: ColumnDataType;
  required: boolean;
  severity: Severity;
  pattern?: string;
  patternHint?: string;
  allowed?: string[];
  min?: number;
  max?: number;
  /** When set, the column holds a unit of measure that must equal one of `allowed`. */
  isUnit?: boolean;
  unique?: boolean;
  description: string;
}

export interface CrossFieldRule {
  ruleId: string;
  sheet: string;
  left: string;
  op: '<=' | '<' | '>=' | '>';
  right: string;
  severity: Severity;
  description: string;
}

export interface SheetSpec {
  name: string;
  required: boolean;
  description: string;
}

export interface RequirementDocument {
  id: string;
  code: string;
  title: string;
  version: string;
  documentType: DocumentType;
  standardRefs: string[];
  effectiveDate: string;
  owner: string;
  sheets: SheetSpec[];
  columns: ColumnSpec[];
  crossRules: CrossFieldRule[];
  keyRules: string[];
}

// ---------------------------------------------------------------------------
// Uploaded workbook metadata (no cell data is persisted in browser storage)
// ---------------------------------------------------------------------------

export interface SheetMeta {
  name: string;
  columns: string[];
  rowCount: number;
}

export interface WorkbookMeta {
  fileName: string;
  fileSize: number;
  sheets: SheetMeta[];
  formulaCellCount: number;
  /** True when the rows were generated synthetically rather than uploaded in this browser session. */
  synthetic: boolean;
  /** Synthetic data profile used by the mock layer (prototype only). */
  sampleProfile?: 'clean' | 'warnings' | 'major' | 'dirty';
}

/** In-memory parsed workbook (never written to localStorage). */
export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  formulaCellCount: number;
}

// ---------------------------------------------------------------------------
// Validation results
// ---------------------------------------------------------------------------

export type CheckStatus = 'passed' | 'failed' | 'warning';

/** A single field-level finding (failed or warning). */
export interface ValidationFinding {
  id: string;
  ruleId: string;
  category: ValidationCategory;
  sheet: string;
  /** Excel row number (1-based, header row = 1). null for sheet/column-level findings. */
  row: number | null;
  field: string;
  actual: string;
  expected: string;
  message: string;
  severity: Severity;
  status: Exclude<CheckStatus, 'passed'>;
}

/** Passed checks are aggregated per rule to keep reports compact. */
export interface PassedRuleSummary {
  ruleId: string;
  category: ValidationCategory;
  sheet: string;
  field: string;
  expected: string;
  passedCount: number;
  severity: Severity;
}

export type OverallValidation = 'passed' | 'passed_with_warnings' | 'failed';

export interface ValidationReport {
  id: string;
  documentId: string;
  versionNo: number;
  revision: string;
  requirementId: string;
  requirementCode: string;
  requirementVersion: string;
  runAt: string;
  runBy: string;
  scope: 'full' | 'partial';
  sheetsValidated: string[];
  synthetic: boolean;
  totals: {
    rowsChecked: number;
    rulesChecked: number;
    checksPerformed: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    criticalFailures: number;
    /** Unique rows with at least one failed check (not field-level count). */
    failingRows: number;
    /** Unique rows with warnings but no failures. */
    warningRows: number;
  };
  bySheet: { sheet: string; rows: number; failed: number; warnings: number; failingRows: number }[];
  byCategory: { category: ValidationCategory; passed: number; failed: number; warnings: number }[];
  overall: OverallValidation;
  findings: ValidationFinding[];
  passedRules: PassedRuleSummary[];
  /** Cell values for rows that have findings only (capped), used for row-detail views. */
  rowSnapshots: RowSnapshot[];
}

export interface RowSnapshot {
  sheet: string;
  row: number;
  values: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export type WorkflowStage =
  | 'draft'
  | 'uploaded'
  | 'validation_in_progress'
  | 'validation_failed'
  | 'validation_passed'
  | 'manual_testing'
  | 'ready_for_review'
  | 'pending_approval'
  | 'changes_requested'
  | 'approved'
  | 'vendor_ready'
  | 'vendor_submitted';

export type ValidationStatus = 'not_started' | 'in_progress' | 'passed' | 'passed_with_warnings' | 'failed';
export type ManualTestStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';
export type ApprovalStatus = 'not_submitted' | 'pending' | 'approved' | 'changes_requested';
export type VendorStatus = 'not_ready' | 'ready' | 'submitted';

export type ManualResult = 'pass' | 'fail' | 'na';

export interface ManualTestItem {
  id: string;
  title: string;
  description: string;
  required: boolean;
  result: ManualResult | null;
  comment: string;
}

export interface ManualTestSession {
  versionNo: number;
  testerName: string;
  testDate: string;
  items: ManualTestItem[];
  observations: string;
  evidence: { name: string; size: number }[];
  status: ManualTestStatus;
  deviation?: { acknowledged: boolean; justification: string };
  updatedAt: string;
  completedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  versionNo: number;
  revision: string;
  reportId: string | null;
  decision: 'approved' | 'changes_requested';
  comment: string;
  reviewerId: string;
  reviewerName: string;
  decidedAt: string;
}

export interface SubmissionRecord {
  versionNo: number;
  revision: string;
  submittedAt: string;
  submittedBy: string;
  comment: string;
  deviationRequested: boolean;
}

export interface VendorSubmission {
  versionNo: number;
  revision: string;
  vendorId: string;
  vendorName: string;
  contactName: string;
  contactEmail: string;
  transmittalNo: string;
  packageItems: string[];
  notes: string;
  submittedAt: string;
  submittedBy: string;
}

export interface DocumentVersion {
  versionNo: number;
  revision: string;
  uploadedAt: string;
  uploadedBy: string;
  file: WorkbookMeta;
  changeNote: string;
  reportIds: string[];
}

export interface EngDocument {
  id: string;
  docNumber: string;
  title: string;
  projectId: string;
  assetId: string;
  type: DocumentType;
  requirementId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  stage: WorkflowStage;
  validationStatus: ValidationStatus;
  manualTestStatus: ManualTestStatus;
  approvalStatus: ApprovalStatus;
  vendorStatus: VendorStatus;
  latestReportId: string | null;
  versions: DocumentVersion[];
  manualTests: Record<number, ManualTestSession>;
  submissions: SubmissionRecord[];
  approvals: ApprovalRecord[];
  vendorSubmissions: VendorSubmission[];
}

/** Lightweight row used in tables. */
export interface DocumentSummary {
  id: string;
  docNumber: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  assetTag: string;
  type: DocumentType;
  ownerId: string;
  ownerName: string;
  revision: string;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  stage: WorkflowStage;
  validationStatus: ValidationStatus;
  manualTestStatus: ManualTestStatus;
  approvalStatus: ApprovalStatus;
  vendorStatus: VendorStatus;
  latestReportId: string | null;
  failingRows: number | null;
  criticalFailures: number | null;
}

export type AuditAction =
  | 'document_created'
  | 'file_uploaded'
  | 'new_version_uploaded'
  | 'validation_started'
  | 'validation_completed'
  | 'manual_testing_saved'
  | 'manual_testing_completed'
  | 'submitted_for_approval'
  | 'approved'
  | 'changes_requested'
  | 'moved_to_vendor_ready'
  | 'vendor_submitted'
  | 'access_denied';

export interface AuditEvent {
  id: string;
  documentId: string | null;
  docNumber: string | null;
  versionNo: number | null;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  detail: string;
  outcome: 'success' | 'denied';
  at: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  documentId: string | null;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  scope: string;
  contactName: string;
  contactEmail: string;
}

// ---------------------------------------------------------------------------
// Query contracts
// ---------------------------------------------------------------------------

export interface DocumentFilters {
  q?: string;
  projectId?: string;
  ownerId?: string;
  type?: DocumentType;
  stage?: WorkflowStage | WorkflowStage[];
  stageGroup?: StageGroup;
  from?: string;
  to?: string;
  mine?: boolean;
  sort?: keyof Pick<DocumentSummary, 'docNumber' | 'title' | 'updatedAt' | 'createdAt' | 'stage' | 'projectCode'>;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export type StageGroup =
  | 'pending_validation'
  | 'validation_completed'
  | 'failed'
  | 'pending_manual'
  | 'submitted'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'pending_engineer'
  | 'vendor_ready'
  | 'vendor_submitted';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrendPoint {
  label: string;
  passed: number;
  warnings: number;
  failed: number;
}

export interface EngineerStats {
  total: number;
  pendingValidation: number;
  validationCompleted: number;
  failed: number;
  pendingManual: number;
  submitted: number;
  trend: TrendPoint[];
}

export interface ManagerStats {
  total: number;
  awaitingApproval: number;
  approved: number;
  rejected: number;
  pendingEngineer: number;
  vendorReady: number;
  vendorSubmitted: number;
  trend: TrendPoint[];
  byProject: { projectCode: string; projectName: string; inProgress: number; awaiting: number; changes: number; approved: number }[];
  workload: { engineerId: string; name: string; active: number; awaiting: number; completed: number }[];
  turnaround: { avgHours: number; medianHours: number; within48hPct: number; byWeek: { label: string; avgHours: number | null }[] };
}

export type ReportSummary = Omit<ValidationReport, 'findings' | 'passedRules' | 'rowSnapshots'> & { docNumber: string; title: string; ownerId: string };

export interface PublicUser {
  id: string;
  name: string;
  role: Role;
  title: string;
  initials: string;
}

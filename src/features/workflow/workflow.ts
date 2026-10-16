// Workflow state machine, permission rules and submission gating.
//
// These pure functions are shared by the UI (to decide what to show) and the
// mock API layer (to enforce). In production the backend MUST enforce the same
// rules independently — anything evaluated in the browser is untrusted.

import type { EngDocument, ManualTestSession, User, ValidationReport, WorkflowStage } from '@/types';

export const STAGE_ORDER: WorkflowStage[] = [
  'draft',
  'uploaded',
  'validation_in_progress',
  'validation_passed',
  'manual_testing',
  'ready_for_review',
  'pending_approval',
  'approved',
  'vendor_ready',
  'vendor_submitted',
];

/** Allowed stage transitions. Anything not listed is rejected with 409. */
export const TRANSITIONS: Record<WorkflowStage, WorkflowStage[]> = {
  draft: ['uploaded'],
  uploaded: ['validation_in_progress', 'uploaded'],
  validation_in_progress: ['validation_passed', 'validation_failed'],
  validation_failed: ['validation_in_progress', 'uploaded', 'manual_testing'],
  validation_passed: ['validation_in_progress', 'uploaded', 'manual_testing'],
  manual_testing: ['manual_testing', 'ready_for_review', 'validation_in_progress', 'uploaded'],
  ready_for_review: ['pending_approval', 'manual_testing', 'validation_in_progress', 'uploaded'],
  pending_approval: ['approved', 'changes_requested'],
  changes_requested: ['uploaded', 'validation_in_progress'],
  approved: ['vendor_ready'],
  vendor_ready: ['vendor_submitted'],
  vendor_submitted: ['uploaded'],
};

export function canTransition(from: WorkflowStage, to: WorkflowStage) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type PermissionAction =
  | 'document.view'
  | 'document.create'
  | 'document.upload_version'
  | 'document.validate'
  | 'document.manual_test'
  | 'document.submit'
  | 'document.approve'
  | 'document.request_changes'
  | 'document.vendor_submit';

const ENGINEER_ACTIONS: PermissionAction[] = ['document.view', 'document.create', 'document.upload_version', 'document.validate', 'document.manual_test', 'document.submit'];
const MANAGER_ACTIONS: PermissionAction[] = ['document.view', 'document.approve', 'document.request_changes', 'document.vendor_submit'];

/**
 * Role + ownership + project-membership check.
 * Engineers act only on documents they own; managers act only within projects
 * they manage and never on documents they authored (segregation of duties).
 */
export function can(user: User | null | undefined, action: PermissionAction, doc?: Pick<EngDocument, 'ownerId' | 'projectId'>) {
  if (!user) return false;
  if (user.role === 'engineer') {
    if (!ENGINEER_ACTIONS.includes(action)) return false;
    if (action === 'document.create') return true;
    return !!doc && doc.ownerId === user.id;
  }
  if (!MANAGER_ACTIONS.includes(action)) return false;
  if (!doc) return false;
  if (!user.projectIds.includes(doc.projectId)) return false;
  if (action !== 'document.view' && doc.ownerId === user.id) return false;
  return true;
}

export const VALIDATABLE_STAGES: WorkflowStage[] = ['uploaded', 'validation_failed', 'validation_passed', 'manual_testing', 'ready_for_review', 'changes_requested'];
export const NEW_VERSION_STAGES: WorkflowStage[] = ['uploaded', 'validation_failed', 'validation_passed', 'manual_testing', 'ready_for_review', 'changes_requested', 'vendor_submitted'];
export const MANUAL_TEST_STAGES: WorkflowStage[] = ['validation_passed', 'validation_failed', 'manual_testing', 'ready_for_review'];

/** Reasons manual testing cannot start for the current version (empty = allowed). */
export function manualTestBlockers(doc: EngDocument, report: ValidationReport | null): string[] {
  const reasons: string[] = [];
  if (!MANUAL_TEST_STAGES.includes(doc.stage)) reasons.push('Manual testing is only available after automated validation has completed for the current version.');
  if (!report || report.versionNo !== doc.currentVersion) reasons.push('Run automated validation on the current version first.');
  else if (report.totals.criticalFailures > 0) reasons.push(`${report.totals.criticalFailures} critical validation failure(s) must be fixed in a new version before manual testing.`);
  return reasons;
}

/**
 * Gate for "Submit for manager approval". Blocks when required manual tests are
 * incomplete/failed, validation is partial or stale, or critical failures remain.
 * Unresolved MAJOR failures are allowed only via an explicit, justified deviation
 * request which the manager sees highlighted (authorised exception workflow).
 */
export function submissionBlockers(doc: EngDocument, report: ValidationReport | null, session: ManualTestSession | undefined): string[] {
  const reasons: string[] = [];
  const testingIncomplete = !session || session.versionNo !== doc.currentVersion || session.status !== 'completed';
  // Avoid a duplicate message: incomplete manual testing is reported below.
  if (doc.stage !== 'ready_for_review' && !testingIncomplete) reasons.push('Document must be in “Ready for Manager Review”.');
  if (!report || report.versionNo !== doc.currentVersion) reasons.push('No automated validation report exists for the current version.');
  else {
    if (report.scope !== 'full') reasons.push('Latest validation covered only selected worksheets. Re-run validation on all worksheets.');
    if (report.totals.criticalFailures > 0) reasons.push(`${report.totals.criticalFailures} unresolved critical validation failure(s).`);
    if (report.totals.failedChecks > report.totals.criticalFailures && !(session?.deviation?.acknowledged && (session.deviation.justification?.trim().length ?? 0) >= 20)) {
      reasons.push('Unresolved major findings require a deviation request with written justification (min. 20 characters) in manual testing.');
    }
  }
  if (!session || session.versionNo !== doc.currentVersion) reasons.push('Manual testing has not been recorded for the current version.');
  else {
    if (session.status !== 'completed') reasons.push('Manual testing is not completed.');
    const open = session.items.filter((i) => i.required && i.result === null);
    if (open.length) reasons.push(`${open.length} required manual test(s) have no result.`);
    const failed = session.items.filter((i) => i.result === 'fail');
    if (failed.length) reasons.push(`${failed.length} manual test(s) failed.`);
  }
  return reasons;
}

export function stageProgressIndex(stage: WorkflowStage) {
  const map: Partial<Record<WorkflowStage, WorkflowStage>> = { validation_failed: 'validation_passed', changes_requested: 'pending_approval' };
  return STAGE_ORDER.indexOf(map[stage] ?? stage);
}

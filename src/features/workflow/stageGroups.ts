import type { EngDocument, StageGroup, WorkflowStage } from '@/types';

type Doc = Pick<EngDocument, 'stage' | 'validationStatus' | 'approvalStatus'>;

/** Single definition of each dashboard bucket, shared by stats and list filters so counts always match. */
export const STAGE_GROUPS: Record<StageGroup, { label: string; match: (d: Doc) => boolean }> = {
  pending_validation: { label: 'Pending Validation', match: (d) => d.stage === 'uploaded' || d.stage === 'validation_in_progress' },
  validation_completed: { label: 'Validation Completed', match: (d) => d.validationStatus === 'passed' || d.validationStatus === 'passed_with_warnings' },
  failed: { label: 'Failed Validation', match: (d) => d.stage === 'validation_failed' },
  pending_manual: { label: 'Pending Manual Testing', match: (d) => d.stage === 'validation_passed' || d.stage === 'manual_testing' },
  submitted: { label: 'Submitted for Approval', match: (d) => d.approvalStatus === 'pending' || d.approvalStatus === 'approved' },
  awaiting_approval: { label: 'Awaiting Approval', match: (d) => d.stage === 'pending_approval' },
  approved: { label: 'Approved', match: (d) => d.approvalStatus === 'approved' },
  rejected: { label: 'Changes Requested', match: (d) => d.stage === 'changes_requested' },
  pending_engineer: {
    label: 'Pending Discipline Engineer Action',
    match: (d) => (['uploaded', 'validation_failed', 'validation_passed', 'manual_testing', 'ready_for_review', 'changes_requested'] as WorkflowStage[]).includes(d.stage),
  },
  vendor_ready: { label: 'Ready for Vendor Submission', match: (d) => d.stage === 'vendor_ready' },
  vendor_submitted: { label: 'Vendor Submitted', match: (d) => d.stage === 'vendor_submitted' },
};

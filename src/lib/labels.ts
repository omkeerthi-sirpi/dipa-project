import type { ApprovalStatus, AuditAction, DocumentType, ManualTestStatus, Severity, ValidationCategory, ValidationStatus, VendorStatus, WorkflowStage } from '@/types';

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  equipment_data_sheet: 'Equipment Data Sheet',
  pipeline_inspection: 'Pipeline Inspection Data',
  pressure_vessel_spec: 'Pressure Vessel Specifications',
  instrumentation_data: 'Instrumentation Data',
  maintenance_records: 'Maintenance Records',
};

export const STAGE_LABEL: Record<WorkflowStage, string> = {
  draft: 'Draft',
  uploaded: 'Uploaded',
  validation_in_progress: 'Validation In Progress',
  validation_failed: 'Validation Failed',
  validation_passed: 'Validation Passed',
  manual_testing: 'Manual Testing In Progress',
  ready_for_review: 'Ready for Manager Review',
  pending_approval: 'Pending Manager Approval',
  changes_requested: 'Changes Requested',
  approved: 'Manager Approved',
  vendor_ready: 'Vendor Submission Ready',
  vendor_submitted: 'Vendor Submitted',
};

export const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  not_started: 'Not validated',
  in_progress: 'Validating',
  passed: 'Passed',
  passed_with_warnings: 'Passed w/ warnings',
  failed: 'Failed',
};

export const MANUAL_LABEL: Record<ManualTestStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_submitted: 'Not submitted',
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

export const VENDOR_LABEL: Record<VendorStatus, string> = {
  not_ready: 'Not ready',
  ready: 'Ready',
  submitted: 'Submitted',
};

export const CATEGORY_LABEL: Record<ValidationCategory, string> = {
  required_structure: 'Required worksheet / column',
  required_field: 'Required field',
  missing_value: 'Missing / empty value',
  data_type: 'Data type & format',
  allowed_value: 'Allowed value',
  range: 'Min / max range',
  duplicate: 'Duplicate record',
  cross_field: 'Cross-field consistency',
  unit: 'Unit of measurement',
};

export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', major: 'Major', minor: 'Minor' };

export const AUDIT_LABEL: Record<AuditAction, string> = {
  document_created: 'Document created',
  file_uploaded: 'File uploaded',
  new_version_uploaded: 'New version uploaded',
  validation_started: 'Validation started',
  validation_completed: 'Validation completed',
  manual_testing_saved: 'Manual testing saved',
  manual_testing_completed: 'Manual testing completed',
  submitted_for_approval: 'Submitted for approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  moved_to_vendor_ready: 'Vendor submission ready',
  vendor_submitted: 'Submitted to vendor',
  access_denied: 'Access denied',
};

// Typed service functions — the only place UI code talks to the API.
import type {
  AppNotification,
  AuditEvent,
  DocumentFilters,
  DocumentSummary,
  EngDocument,
  EngineerStats,
  ManagerStats,
  Paged,
  ParsedWorkbook,
  Project,
  PublicUser,
  ReportSummary,
  RequirementDocument,
  Session,
  ValidationReport,
  Vendor,
} from '@/types';
import type { CreateDocumentInput, ManualTestInput, VendorSubmitInput } from '@/mocks/ops';
import { config } from '@/lib/config';
import { api } from './apiClient';

export type { CreateDocumentInput, ManualTestInput, VendorSubmitInput };

/**
 * Upload payload. In mock mode the parsed workbook travels with the request so the
 * in-browser mock server can validate it. Against a real backend the original File
 * is sent as multipart/form-data and the server parses and validates it independently.
 */
function uploadBody(input: unknown, file: File | null, workbook: ParsedWorkbook | null) {
  if (config.useMocks || !file) return { input, workbook };
  const form = new FormData();
  form.append('metadata', JSON.stringify(input));
  form.append('file', file);
  return form;
}

export const authService = {
  login: (email: string, password: string) => api.post<Session>('/auth/login', { email, password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  session: () => api.get<Session>('/auth/session'),
  resetDemo: () => api.post<{ ok: true }>('/demo/reset'),
};

export const referenceService = {
  projects: () => api.get<Project[]>('/projects'),
  requirements: () => api.get<RequirementDocument[]>('/requirements'),
  vendors: () => api.get<Vendor[]>('/vendors'),
  users: () => api.get<PublicUser[]>('/users'),
};

export const documentService = {
  list: (f: DocumentFilters) => api.get<Paged<DocumentSummary>>('/documents', f as Record<string, string>),
  get: (id: string) => api.get<EngDocument>(`/documents/${encodeURIComponent(id)}`),
  create: (input: CreateDocumentInput, file: File | null, workbook: ParsedWorkbook | null) => api.post<EngDocument>('/documents', uploadBody(input, file, workbook)),
  uploadVersion: (id: string, input: Pick<CreateDocumentInput, 'revision' | 'changeNote' | 'file'>, file: File | null, workbook: ParsedWorkbook | null) =>
    api.post<EngDocument>(`/documents/${encodeURIComponent(id)}/versions`, uploadBody(input, file, workbook)),
  validate: (id: string, sheets?: string[], useSynthetic?: boolean) => api.post<ValidationReport>(`/documents/${encodeURIComponent(id)}/validate`, { sheets, useSynthetic }),
  saveManualTest: (id: string, input: ManualTestInput) => api.put<EngDocument>(`/documents/${encodeURIComponent(id)}/manual-test`, input),
  submit: (id: string, comment: string) => api.post<EngDocument>(`/documents/${encodeURIComponent(id)}/submit`, { comment }),
  decide: (id: string, decision: 'approved' | 'changes_requested', comment: string, versionNo: number) =>
    api.post<EngDocument>(`/documents/${encodeURIComponent(id)}/decision`, { decision, comment, versionNo }),
  vendorSubmit: (id: string, input: VendorSubmitInput) => api.post<EngDocument>(`/documents/${encodeURIComponent(id)}/vendor-submission`, input),
};

export const reportService = {
  list: (documentId?: string) => api.get<ReportSummary[]>('/reports', { documentId }),
  get: (id: string) => api.get<ValidationReport>(`/reports/${encodeURIComponent(id)}`),
};

export const statsService = {
  engineer: () => api.get<EngineerStats>('/stats/engineer'),
  manager: () => api.get<ManagerStats>('/stats/manager'),
};

export const auditService = {
  list: (q: { documentId?: string; action?: string; limit?: number } = {}) => api.get<AuditEvent[]>('/audit', q),
};

export const notificationService = {
  list: () => api.get<AppNotification[]>('/notifications'),
  markRead: (ids?: string[]) => api.post<{ ok: true }>('/notifications/read', { ids }),
};

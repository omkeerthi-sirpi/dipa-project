import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  auditService,
  authService,
  documentService,
  notificationService,
  referenceService,
  reportService,
  statsService,
  type CreateDocumentInput,
  type ManualTestInput,
  type VendorSubmitInput,
} from '@/services';
import { isApiError } from '@/services/apiError';
import { bumpSessionEpoch } from '@/services/apiClient';
import type { DocumentFilters, ParsedWorkbook } from '@/types';

export const qk = {
  session: ['session'] as const,
  documents: (f?: DocumentFilters) => (f ? (['documents', f] as const) : (['documents'] as const)),
  document: (id: string) => ['document', id] as const,
  reports: (documentId?: string) => (documentId ? (['reports', documentId] as const) : (['reports'] as const)),
  report: (id: string) => ['report', id] as const,
  stats: (role?: string) => (role ? (['stats', role] as const) : (['stats'] as const)),
  audit: (q?: object) => (q ? (['audit', q] as const) : (['audit'] as const)),
  notifications: ['notifications'] as const,
  projects: ['projects'] as const,
  requirements: ['requirements'] as const,
  vendors: ['vendors'] as const,
  users: ['users'] as const,
};

/** Invalidate everything a workflow transition can affect. */
function invalidateWorkflow(qc: QueryClient, docId?: string) {
  qc.invalidateQueries({ queryKey: qk.documents() });
  qc.invalidateQueries({ queryKey: qk.stats() });
  qc.invalidateQueries({ queryKey: qk.audit() });
  qc.invalidateQueries({ queryKey: qk.reports() });
  qc.invalidateQueries({ queryKey: qk.notifications });
  if (docId) qc.invalidateQueries({ queryKey: qk.document(docId) });
}

// ---- session ----
export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: async () => {
      try {
        return await authService.session();
      } catch (e) {
        if (isApiError(e) && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authService.login(email, password),
    onSuccess: (session) => {
      bumpSessionEpoch();
      qc.clear();
      qc.setQueryData(qk.session, session);
    },
    onError: () => {},
  });
}

/** Atomically switch demo persona (no intermediate signed-out state). */
export function useSwitchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      await authService.logout();
      return authService.login(email, 'demo');
    },
    onSuccess: (session) => {
      bumpSessionEpoch();
      qc.clear();
      qc.setQueryData(qk.session, session);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      bumpSessionEpoch();
      qc.clear();
      qc.setQueryData(qk.session, null);
    },
  });
}

export function useResetDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authService.resetDemo(),
    onSuccess: () => {
      const session = qc.getQueryData(qk.session);
      qc.clear();
      qc.setQueryData(qk.session, session);
    },
  });
}

// ---- reference data ----
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: referenceService.projects, staleTime: Infinity });
export const useRequirements = () => useQuery({ queryKey: qk.requirements, queryFn: referenceService.requirements, staleTime: Infinity });
export const useVendors = (enabled = true) => useQuery({ queryKey: qk.vendors, queryFn: referenceService.vendors, staleTime: Infinity, enabled });
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: referenceService.users, staleTime: Infinity });

// ---- documents ----
export const useDocuments = (f: DocumentFilters) => useQuery({ queryKey: qk.documents(f), queryFn: () => documentService.list(f), placeholderData: keepPreviousData });
export const useDocument = (id: string | undefined) => useQuery({ queryKey: qk.document(id ?? ''), queryFn: () => documentService.get(id!), enabled: !!id });

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { input: CreateDocumentInput; file: File | null; workbook: ParsedWorkbook | null }) => documentService.create(v.input, v.file, v.workbook),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc);
    },
  });
}

export function useUploadVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: Pick<CreateDocumentInput, 'revision' | 'changeNote' | 'file'>; file: File | null; workbook: ParsedWorkbook | null }) =>
      documentService.uploadVersion(v.id, v.input, v.file, v.workbook),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc, doc.id);
    },
  });
}

export function useRunValidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; sheets?: string[]; useSynthetic?: boolean }) => documentService.validate(v.id, v.sheets, v.useSynthetic),
    onSuccess: (report) => {
      qc.setQueryData(qk.report(report.id), report);
      invalidateWorkflow(qc, report.documentId);
    },
  });
}

export function useSaveManualTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: ManualTestInput }) => documentService.saveManualTest(v.id, v.input),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc, doc.id);
    },
  });
}

export function useSubmitForApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; comment: string }) => documentService.submit(v.id, v.comment),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc, doc.id);
    },
  });
}

export function useDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; decision: 'approved' | 'changes_requested'; comment: string; versionNo: number }) => documentService.decide(v.id, v.decision, v.comment, v.versionNo),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc, doc.id);
    },
  });
}

export function useVendorSubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: VendorSubmitInput }) => documentService.vendorSubmit(v.id, v.input),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id), doc);
      invalidateWorkflow(qc, doc.id);
    },
  });
}

// ---- reports, stats, audit, notifications ----
export const useReports = (documentId?: string) => useQuery({ queryKey: qk.reports(documentId), queryFn: () => reportService.list(documentId) });
export const useReport = (id: string | null | undefined) => useQuery({ queryKey: qk.report(id ?? ''), queryFn: () => reportService.get(id!), enabled: !!id, staleTime: Infinity });
export const useEngineerStats = () => useQuery({ queryKey: qk.stats('engineer'), queryFn: statsService.engineer });
export const useManagerStats = () => useQuery({ queryKey: qk.stats('manager'), queryFn: statsService.manager });
export const useAudit = (q: { documentId?: string; action?: string; limit?: number } = {}) => useQuery({ queryKey: qk.audit(q), queryFn: () => auditService.list(q) });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: notificationService.list, refetchInterval: 30_000 });

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationService.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

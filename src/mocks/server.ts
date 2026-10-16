// MOCK BACKEND — in-browser HTTP-style router.
//
// Simulates the REST API the production backend will expose. It resolves the
// caller from a mock session (standing in for an HttpOnly session cookie),
// enforces authorisation on every protected route and returns 401/403/404/409/422
// just like the real service should. None of this is a security boundary: the
// browser can tamper with it freely. It exists to exercise the UI contract.

import { ApiError } from '@/services/apiError';
import { STAGE_GROUPS } from '@/features/workflow/stageGroups';
import { can } from '@/features/workflow/workflow';
import type {
  AuditEvent,
  DocumentFilters,
  DocumentSummary,
  EngDocument,
  EngineerStats,
  ManagerStats,
  Paged,
  ParsedWorkbook,
  PublicUser,
  ReportSummary,
  Session,
  TrendPoint,
  User,
  ValidationReport,
} from '@/types';
import { DEMO_ENGINEER_ID, DEMO_MANAGER_ID, projects, requirements, users, vendors } from './data/reference';
import { type DbState, getDb, persist, registerSeeder, resetDb } from './db';
import * as ops from './ops';
import { seedDatabase } from './seed';

registerSeeder(seedDatabase);

const SESSION_KEY = 'dipa.mock-session';
const SESSION_TTL_MS = 8 * 3600_000;
const DEMO_ACCOUNTS = [DEMO_ENGINEER_ID, DEMO_MANAGER_ID];

interface MockSessionRecord {
  userId: string;
  expiresAt: string;
}

// The mock "cookie": only a demo user id + expiry. No password, token or secret is ever stored.
function readSession(): MockSessionRecord | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockSessionRecord) : null;
  } catch {
    return null;
  }
}

function requireUser(): User {
  const rec = readSession();
  if (!rec) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
  if (new Date(rec.expiresAt).getTime() < Date.now()) {
    localStorage.removeItem(SESSION_KEY);
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  const user = users.find((u) => u.id === rec.userId);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session is no longer valid.');
  return user;
}

const toPublic = (u: User): PublicUser => ({ id: u.id, name: u.name, role: u.role, title: u.title, initials: u.initials });

function visibleDocs(s: DbState, user: User) {
  return s.documents.filter((d) => can(user, 'document.view', d));
}

function getVisibleDoc(s: DbState, user: User, id: string) {
  const doc = ops.findDoc(s, id);
  if (!can(user, 'document.view', doc)) {
    ops.audit(s, user, 'access_denied', `Denied read access to ${doc.docNumber}`, new Date(), doc, 'denied');
    persist();
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this document.');
  }
  return doc;
}

function toSummary(s: DbState, d: EngDocument): DocumentSummary {
  const p = projects.find((x) => x.id === d.projectId)!;
  const v = d.versions.find((x) => x.versionNo === d.currentVersion)!;
  const r = d.latestReportId ? s.reports.find((x) => x.id === d.latestReportId) : null;
  return {
    id: d.id,
    docNumber: d.docNumber,
    title: d.title,
    projectId: d.projectId,
    projectCode: p.code,
    projectName: p.name,
    assetTag: p.assets.find((a) => a.id === d.assetId)?.tag ?? '',
    type: d.type,
    ownerId: d.ownerId,
    ownerName: users.find((u) => u.id === d.ownerId)?.name ?? 'Unknown',
    revision: v.revision,
    versionNo: v.versionNo,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    stage: d.stage,
    validationStatus: d.validationStatus,
    manualTestStatus: d.manualTestStatus,
    approvalStatus: d.approvalStatus,
    vendorStatus: d.vendorStatus,
    latestReportId: d.latestReportId,
    failingRows: r ? r.totals.failingRows : null,
    criticalFailures: r ? r.totals.criticalFailures : null,
  };
}

function reportSummary(s: DbState, r: ValidationReport): ReportSummary {
  const { findings: _f, passedRules: _p, rowSnapshots: _s, ...rest } = r;
  const d = s.documents.find((x) => x.id === r.documentId)!;
  return { ...rest, docNumber: d.docNumber, title: d.title, ownerId: d.ownerId };
}

function listDocuments(s: DbState, user: User, f: DocumentFilters): Paged<DocumentSummary> {
  let docs = visibleDocs(s, user);
  if (f.mine) docs = docs.filter((d) => d.ownerId === user.id);
  if (f.projectId) docs = docs.filter((d) => d.projectId === f.projectId);
  if (f.ownerId) docs = docs.filter((d) => d.ownerId === f.ownerId);
  if (f.type) docs = docs.filter((d) => d.type === f.type);
  if (f.stage) {
    const stages = Array.isArray(f.stage) ? f.stage : [f.stage];
    docs = docs.filter((d) => stages.includes(d.stage));
  }
  if (f.stageGroup && STAGE_GROUPS[f.stageGroup]) docs = docs.filter(STAGE_GROUPS[f.stageGroup].match);
  if (f.from) docs = docs.filter((d) => d.updatedAt.slice(0, 10) >= f.from!);
  if (f.to) docs = docs.filter((d) => d.updatedAt.slice(0, 10) <= f.to!);
  let rows = docs.map((d) => toSummary(s, d));
  if (f.q) {
    const q = f.q.toLowerCase().slice(0, 100);
    rows = rows.filter((r) => [r.docNumber, r.title, r.projectName, r.projectCode, r.assetTag, r.ownerName].some((x) => x.toLowerCase().includes(q)));
  }
  const sort = f.sort ?? 'updatedAt';
  const dir = f.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => String(a[sort]).localeCompare(String(b[sort])) * dir);
  const pageSize = Math.min(Math.max(f.pageSize ?? 10, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

function weeklyTrend(reports: ValidationReport[], weeks = 8): TrendPoint[] {
  const now = new Date();
  const start = new Date(now.getTime() - weeks * 7 * 86400000);
  const points: TrendPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    const from = new Date(start.getTime() + w * 7 * 86400000);
    const to = new Date(from.getTime() + 7 * 86400000);
    const inWeek = reports.filter((r) => {
      const t = new Date(r.runAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    });
    points.push({
      label: to.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      passed: inWeek.filter((r) => r.overall === 'passed').length,
      warnings: inWeek.filter((r) => r.overall === 'passed_with_warnings').length,
      failed: inWeek.filter((r) => r.overall === 'failed').length,
    });
  }
  return points;
}

function engineerStats(s: DbState, user: User): EngineerStats {
  const docs = visibleDocs(s, user).filter((d) => d.ownerId === user.id);
  const count = (g: keyof typeof STAGE_GROUPS) => docs.filter(STAGE_GROUPS[g].match).length;
  const ids = new Set(docs.map((d) => d.id));
  return {
    total: docs.length,
    pendingValidation: count('pending_validation'),
    validationCompleted: count('validation_completed'),
    failed: count('failed'),
    pendingManual: count('pending_manual'),
    submitted: count('submitted'),
    trend: weeklyTrend(s.reports.filter((r) => ids.has(r.documentId))),
  };
}

function managerStats(s: DbState, user: User): ManagerStats {
  const docs = visibleDocs(s, user);
  const count = (g: keyof typeof STAGE_GROUPS) => docs.filter(STAGE_GROUPS[g].match).length;
  const ids = new Set(docs.map((d) => d.id));

  const turnaroundSamples: { at: string; hours: number }[] = [];
  for (const d of docs) {
    for (const a of d.approvals) {
      const sub = [...d.submissions].reverse().find((x) => x.versionNo === a.versionNo && x.submittedAt <= a.decidedAt);
      if (sub) turnaroundSamples.push({ at: a.decidedAt, hours: (new Date(a.decidedAt).getTime() - new Date(sub.submittedAt).getTime()) / 3600000 });
    }
  }
  const hrs = turnaroundSamples.map((x) => x.hours).sort((a, b) => a - b);
  const avg = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;
  const median = hrs.length ? hrs[Math.floor(hrs.length / 2)] : 0;
  const byWeek = weeklyTrend([], 8).map((p, w) => {
    const end = Date.now() - (7 - w) * 7 * 86400000;
    const inWeek = turnaroundSamples.filter((x) => {
      const t = new Date(x.at).getTime();
      return t >= end - 7 * 86400000 && t < end;
    });
    return { label: p.label, avgHours: inWeek.length ? Math.round(inWeek.reduce((a, b) => a + b.hours, 0) / inWeek.length) : null };
  });

  const engineers = users.filter((u) => u.role === 'engineer' && u.projectIds.some((p) => user.projectIds.includes(p)));
  return {
    total: docs.length,
    awaitingApproval: count('awaiting_approval'),
    approved: count('approved'),
    rejected: count('rejected'),
    pendingEngineer: count('pending_engineer'),
    vendorReady: count('vendor_ready'),
    vendorSubmitted: count('vendor_submitted'),
    trend: weeklyTrend(s.reports.filter((r) => ids.has(r.documentId))),
    byProject: projects
      .filter((p) => user.projectIds.includes(p.id))
      .map((p) => {
        const pd = docs.filter((d) => d.projectId === p.id);
        return {
          projectCode: p.code,
          projectName: p.name,
          inProgress: pd.filter((d) => STAGE_GROUPS.pending_engineer.match(d) && d.stage !== 'changes_requested').length,
          awaiting: pd.filter(STAGE_GROUPS.awaiting_approval.match).length,
          changes: pd.filter(STAGE_GROUPS.rejected.match).length,
          approved: pd.filter(STAGE_GROUPS.approved.match).length,
        };
      }),
    workload: engineers.map((e) => {
      const ed = docs.filter((d) => d.ownerId === e.id);
      return {
        engineerId: e.id,
        name: e.name,
        active: ed.filter(STAGE_GROUPS.pending_engineer.match).length,
        awaiting: ed.filter(STAGE_GROUPS.awaiting_approval.match).length,
        completed: ed.filter(STAGE_GROUPS.approved.match).length,
      };
    }),
    turnaround: { avgHours: Math.round(avg), medianHours: Math.round(median), within48hPct: hrs.length ? Math.round((hrs.filter((h) => h <= 48).length / hrs.length) * 100) : 0, byWeek },
  };
}

function visibleAudit(s: DbState, user: User): AuditEvent[] {
  const docIds = new Set(visibleDocs(s, user).filter((d) => user.role === 'manager' || d.ownerId === user.id).map((d) => d.id));
  return s.audit.filter((e) => (e.documentId ? docIds.has(e.documentId) : e.actorId === user.id));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type Handler = (ctx: { params: Record<string, string>; query: Record<string, unknown>; body: any; s: DbState }) => unknown;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  latency?: number;
}

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler, latency?: number) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, pattern, keys, handler, latency });
}

const now = () => new Date();
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

// --- auth ---
route('POST', '/auth/login', ({ body }) => {
  const email = str(body?.email, 200).trim().toLowerCase();
  const password = str(body?.password, 200);
  const user = users.find((u) => u.email === email && DEMO_ACCOUNTS.includes(u.id));
  // MOCK AUTH: any non-empty password is accepted for the two demo accounts. No password is stored.
  if (!user || !password) throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid email or password.');
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() }));
  return { user, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(), mock: true } satisfies Session;
}, 500);
route('POST', '/auth/logout', () => {
  localStorage.removeItem(SESSION_KEY);
  return { ok: true };
}, 200);
route('GET', '/auth/session', () => {
  const user = requireUser();
  return { user, expiresAt: readSession()!.expiresAt, mock: true } satisfies Session;
}, 150);
route('POST', '/demo/reset', () => {
  resetDb();
  return { ok: true };
}, 600);

// --- reference data ---
route('GET', '/projects', () => {
  const u = requireUser();
  return projects.filter((p) => u.projectIds.includes(p.id));
});
route('GET', '/requirements', () => (requireUser(), requirements));
route('GET', '/vendors', () => {
  const u = requireUser();
  if (u.role !== 'manager') throw new ApiError(403, 'FORBIDDEN', 'Vendor directory is restricted to managers.');
  return vendors;
});
route('GET', '/users', () => {
  const u = requireUser();
  return users.filter((x) => u.role === 'manager' || x.id === u.id || x.role === 'manager').map(toPublic);
});

// --- documents ---
route('GET', '/documents', ({ query, s }) => listDocuments(s, requireUser(), query as DocumentFilters));
route('GET', '/documents/:id', ({ params, s }) => getVisibleDoc(s, requireUser(), params.id));
route('POST', '/documents', ({ body, s }) => {
  const doc = ops.createDocument(s, requireUser(), body.input, (body.workbook as ParsedWorkbook) ?? null, now());
  return doc;
}, 900);
route('POST', '/documents/:id/versions', ({ params, body, s }) => ops.uploadVersion(s, requireUser(), params.id, body.input, (body.workbook as ParsedWorkbook) ?? null, now()), 900);
route('POST', '/documents/:id/validate', ({ params, body, s }) => {
  const sheets = Array.isArray(body?.sheets) ? body.sheets.filter((x: unknown) => typeof x === 'string').slice(0, 50) : undefined;
  return ops.runValidation(s, requireUser(), params.id, { sheets, useSynthetic: !!body?.useSynthetic }, now());
}, 2200);
route('PUT', '/documents/:id/manual-test', ({ params, body, s }) => ops.saveManualTest(s, requireUser(), params.id, body, now()), 600);
route('POST', '/documents/:id/submit', ({ params, body, s }) => ops.submitForApproval(s, requireUser(), params.id, { comment: str(body?.comment) }, now()), 700);
route('POST', '/documents/:id/decision', ({ params, body, s }) => {
  const decision = body?.decision === 'approved' ? 'approved' : body?.decision === 'changes_requested' ? 'changes_requested' : null;
  if (!decision) throw new ApiError(422, 'VALIDATION', 'Unknown decision.');
  return ops.decide(s, requireUser(), params.id, { decision, comment: str(body?.comment), versionNo: Number(body?.versionNo) }, now());
}, 700);
route('POST', '/documents/:id/vendor-submission', ({ params, body, s }) => ops.vendorSubmit(s, requireUser(), params.id, body, now()), 1200);

// --- reports ---
route('GET', '/reports', ({ query, s }) => {
  const u = requireUser();
  const docIds = new Set(visibleDocs(s, u).filter((d) => u.role === 'manager' || d.ownerId === u.id).map((d) => d.id));
  return s.reports.filter((r) => docIds.has(r.documentId) && (!query.documentId || r.documentId === query.documentId)).map((r) => reportSummary(s, r));
});
route('GET', '/reports/:id', ({ params, s }) => {
  const u = requireUser();
  const r = s.reports.find((x) => x.id === params.id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Report not found.');
  getVisibleDoc(s, u, r.documentId);
  return r;
});

// --- stats, audit, notifications ---
route('GET', '/stats/engineer', ({ s }) => {
  const u = requireUser();
  if (u.role !== 'engineer') throw new ApiError(403, 'FORBIDDEN', 'Engineer statistics only.');
  return engineerStats(s, u);
});
route('GET', '/stats/manager', ({ s }) => {
  const u = requireUser();
  if (u.role !== 'manager') throw new ApiError(403, 'FORBIDDEN', 'Manager statistics only.');
  return managerStats(s, u);
});
route('GET', '/audit', ({ query, s }) => {
  const u = requireUser();
  let events = visibleAudit(s, u);
  if (query.documentId) events = events.filter((e) => e.documentId === query.documentId);
  if (query.action) events = events.filter((e) => e.action === query.action);
  const limit = Math.min(Number(query.limit) || 50, 500);
  return events.slice(0, limit);
});
route('GET', '/notifications', ({ s }) => {
  const u = requireUser();
  return s.notifications.filter((n) => n.userId === u.id).slice(0, 50);
});
route('POST', '/notifications/read', ({ body, s }) => {
  const u = requireUser();
  const ids: string[] | null = Array.isArray(body?.ids) ? body.ids : null;
  s.notifications.forEach((n) => {
    if (n.userId === u.id && (!ids || ids.includes(n.id))) n.read = true;
  });
  return { ok: true };
}, 150);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let latencyFactor = 1;
/** Test hook: scale simulated network latency (0 disables it). */
export function setMockLatency(factor: number) {
  latencyFactor = factor;
}

export async function handleMockRequest<T>(method: string, path: string, query: Record<string, unknown> = {}, body?: unknown): Promise<T> {
  const r = routes.find((x) => x.method === method && x.pattern.test(path));
  const latency = r?.latency ?? 280;
  if (latencyFactor > 0) await new Promise((res) => setTimeout(res, (latency + Math.random() * 150) * latencyFactor));
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  const m = r.pattern.exec(path)!;
  const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const s = path === '/demo/reset' ? (null as unknown as DbState) : getDb();
  // Simulate JSON serialisation boundary so the UI can never hold references into the store.
  const safeBody = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  try {
    const result = r.handler({ params, query, body: safeBody, s });
    if (MUTATING.has(method)) persist();
    return structuredClone(result) as T;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403 && params.id && s) {
        try {
          const u = requireUser();
          const doc = s.documents.find((d) => d.id === params.id);
          if (doc && !s.audit.some((a) => a.action === 'access_denied' && a.at > new Date(Date.now() - 2000).toISOString())) {
            ops.audit(s, u, 'access_denied', `Denied ${method} ${path.replace(params.id, doc.docNumber)}`, new Date(), doc, 'denied');
            persist();
          }
        } catch {
          /* unauthenticated — nothing to log */
        }
      }
      throw e;
    }
    // Never leak internal errors/stack traces to the UI.
    console.error('[mock-server] internal error', e);
    throw new ApiError(500, 'SERVER', 'The server could not complete the request.');
  }
}

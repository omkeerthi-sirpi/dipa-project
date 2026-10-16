// MOCK BACKEND — persistence for the in-browser mock API.
//
// Only workflow METADATA is persisted to localStorage (document records, report
// findings, audit events, notifications). Uploaded workbook cell data is kept in
// memory only (see fileStore) and is discarded on page refresh.
// localStorage is NOT a secure store and is not used for authorisation decisions
// in production — the real backend owns this state.

import type { AppNotification, AuditEvent, EngDocument, ParsedWorkbook, ValidationReport } from '@/types';

export interface DbState {
  schema: number;
  seededAt: string;
  seq: number;
  documents: EngDocument[];
  reports: ValidationReport[];
  audit: AuditEvent[];
  notifications: AppNotification[];
}

const KEY = 'dipa.mockdb.v1';
const SCHEMA = 1;

let state: DbState | null = null;
let seeder: (() => DbState) | null = null;

export function registerSeeder(fn: () => DbState) {
  seeder = fn;
}

function load(): DbState | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DbState;
    return parsed.schema === SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

export function getDb(): DbState {
  if (!state) {
    state = load();
    if (!state) {
      if (!seeder) throw new Error('Mock seeder not registered');
      state = seeder();
      persist();
    }
  }
  return state;
}

export function persist() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode) — the demo keeps working in memory.
  }
}

export function resetDb() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = null;
  fileStore.clear();
  return getDb();
}

export function emptyDb(): DbState {
  return { schema: SCHEMA, seededAt: new Date().toISOString(), seq: 1000, documents: [], reports: [], audit: [], notifications: [] };
}

export function nextId(s: DbState, prefix: string) {
  s.seq += 1;
  return `${prefix}-${s.seq.toString(36)}`;
}

/** In-memory only: parsed workbook rows keyed by document/version. Never persisted. */
export const fileStore = new Map<string, ParsedWorkbook>();
export const fileKey = (docId: string, versionNo: number) => `${docId}@${versionNo}`;

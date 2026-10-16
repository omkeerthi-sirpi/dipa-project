import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/services/apiError';
import type { EngDocument, Paged, DocumentSummary, ValidationReport } from '@/types';

// Minimal localStorage polyfill for the node test environment.
beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

const { handleMockRequest: req, setMockLatency } = await import('./server');
setMockLatency(0);

const ENGINEER = 'engineer.demo@meridian-energy.example';
const MANAGER = 'manager.demo@meridian-energy.example';
const login = (email: string) => req('POST', '/auth/login', {}, { email, password: 'any' });

async function expectStatus(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.status === status);
}

describe('mock API authorisation & workflow integrity', () => {
  beforeEach(async () => {
    await req('POST', '/demo/reset');
    await req('POST', '/auth/logout');
  });

  it('rejects unauthenticated access', async () => {
    await expectStatus(req('GET', '/documents'), 401);
  });

  it('rejects login for non-demo accounts and empty passwords', async () => {
    await expectStatus(req('POST', '/auth/login', {}, { email: 'd.okafor@meridian-energy.example', password: 'x' }), 401);
    await expectStatus(req('POST', '/auth/login', {}, { email: ENGINEER, password: '' }), 401);
  });

  it('engineer only sees own documents and is denied others (IDOR)', async () => {
    await login(ENGINEER);
    const list = await req<Paged<DocumentSummary>>('GET', '/documents', { pageSize: 100 });
    expect(list.items.every((d) => d.ownerId === 'u-eng-1')).toBe(true);
    await login(MANAGER);
    const all = await req<Paged<DocumentSummary>>('GET', '/documents', { pageSize: 100 });
    const other = all.items.find((d) => d.ownerId !== 'u-eng-1')!;
    await login(ENGINEER);
    await expectStatus(req('GET', `/documents/${other.id}`), 403);
  });

  it('engineer cannot approve or submit to vendor', async () => {
    await login(ENGINEER);
    const list = await req<Paged<DocumentSummary>>('GET', '/documents', { stageGroup: 'awaiting_approval' });
    const doc = list.items[0];
    await expectStatus(req('POST', `/documents/${doc.id}/decision`, {}, { decision: 'approved', comment: '', versionNo: doc.versionNo }), 403);
    await expectStatus(req('POST', `/documents/${doc.id}/vendor-submission`, {}, { versionNo: doc.versionNo, vendorId: 'v-ald' }), 403);
  });

  it('manager cannot upload or validate', async () => {
    await login(MANAGER);
    const list = await req<Paged<DocumentSummary>>('GET', '/documents', { stageGroup: 'failed' });
    await expectStatus(req('POST', `/documents/${list.items[0].id}/validate`, {}, {}), 403);
  });

  it('blocks submission with critical failures and approval of stale versions', async () => {
    await login(ENGINEER);
    const failed = await req<Paged<DocumentSummary>>('GET', '/documents', { stageGroup: 'failed', mine: true });
    const doc = failed.items[0];
    await expectStatus(req('POST', `/documents/${doc.id}/submit`, {}, { comment: '' }), 409);
    await expectStatus(req('PUT', `/documents/${doc.id}/manual-test`, {}, { testerName: 'x', testDate: '2026-10-01', items: [], observations: '', evidence: [], complete: false }), 409);

    await login(MANAGER);
    const pending = await req<Paged<DocumentSummary>>('GET', '/documents', { stageGroup: 'awaiting_approval' });
    const p = pending.items[0];
    await expectStatus(req('POST', `/documents/${p.id}/decision`, {}, { decision: 'approved', comment: '', versionNo: p.versionNo + 1 }), 409);
    await expectStatus(req('POST', `/documents/${p.id}/decision`, {}, { decision: 'changes_requested', comment: 'short', versionNo: p.versionNo }), 422);
    await req('POST', `/documents/${p.id}/decision`, {}, { decision: 'approved', comment: 'ok', versionNo: p.versionNo });
    // Duplicate / concurrent decision is rejected.
    await expectStatus(req('POST', `/documents/${p.id}/decision`, {}, { decision: 'approved', comment: 'ok', versionNo: p.versionNo }), 409);
  });

  it('runs the full engineer → manager → vendor lifecycle with resubmission', async () => {
    await login(ENGINEER);
    const failed = await req<Paged<DocumentSummary>>('GET', '/documents', { stageGroup: 'failed', mine: true });
    const id = failed.items[0].id;
    const before = await req<EngDocument>('GET', `/documents/${id}`);
    const v2 = await req<EngDocument>('POST', `/documents/${id}/versions`, {}, {
      input: { revision: 'Rev Z', changeNote: 'fix', file: { ...before.versions[0].file, sampleProfile: 'clean' } },
      workbook: null,
    });
    expect(v2.currentVersion).toBe(2);
    const rpt = await req<ValidationReport>('POST', `/documents/${id}/validate`, {}, {});
    expect(rpt.overall).toBe('passed');
    const items = ['MT-01', 'MT-02', 'MT-03', 'MT-04', 'MT-05', 'MT-06', 'MT-07'].map((i) => ({ id: i, result: 'pass', comment: '' }));
    const mt = await req<EngDocument>('PUT', `/documents/${id}/manual-test`, {}, { testerName: 'Priya Raman', testDate: '2026-10-15', items, observations: '', evidence: [], complete: true });
    expect(mt.stage).toBe('ready_for_review');
    await req('POST', `/documents/${id}/submit`, {}, { comment: 'ready' });

    await login(MANAGER);
    const rejected = await req<EngDocument>('POST', `/documents/${id}/decision`, {}, { decision: 'changes_requested', comment: 'Please confirm nozzle ratings.', versionNo: 2 });
    expect(rejected.stage).toBe('changes_requested');

    await login(ENGINEER);
    await req('POST', `/documents/${id}/validate`, {}, {});
    await req('PUT', `/documents/${id}/manual-test`, {}, { testerName: 'Priya Raman', testDate: '2026-10-15', items, observations: '', evidence: [], complete: true });
    await req('POST', `/documents/${id}/submit`, {}, { comment: 'resubmitted' });

    await login(MANAGER);
    await expectStatus(req('POST', `/documents/${id}/vendor-submission`, {}, { versionNo: 2, vendorId: 'v-ald', contactName: 'a', contactEmail: 'a@b.example', notes: '', packageItems: [] }), 409);
    const approved = await req<EngDocument>('POST', `/documents/${id}/decision`, {}, { decision: 'approved', comment: 'ok', versionNo: 2 });
    expect(approved.stage).toBe('vendor_ready');
    const done = await req<EngDocument>('POST', `/documents/${id}/vendor-submission`, {}, { versionNo: 2, vendorId: 'v-ald', contactName: 'Hannah Pryce', contactEmail: 'h@x.example', notes: '', packageItems: ['Approved document'] });
    expect(done.stage).toBe('vendor_submitted');
    expect(done.approvals.map((a) => a.decision)).toEqual(['changes_requested', 'approved']);
    expect(done.versions[0].reportIds.length).toBeGreaterThan(0); // history retained
  });
});

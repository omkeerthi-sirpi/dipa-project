import { ChevronLeft, ChevronRight, Eye, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common';
import { CheckBadge, SeverityBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Table, Td, Th } from '@/components/ui/primitives';
import { CATEGORY_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { CheckStatus, Severity, ValidationCategory, ValidationReport } from '@/types';

interface Row {
  key: string;
  status: CheckStatus;
  severity: Severity;
  ruleId: string;
  category: ValidationCategory;
  sheet: string;
  row: number | null;
  rowLabel: string;
  field: string;
  actual: string;
  expected: string;
  message: string;
}

const PAGE = 20;

export function FindingsTable({ report, initialStatus = 'issues' }: { report: ValidationReport; initialStatus?: 'issues' | CheckStatus | 'all' }) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [sheet, setSheet] = useState('');
  const [field, setField] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<{ sheet: string; row: number } | null>(null);

  const rows: Row[] = useMemo(
    () => [
      ...report.findings.map((f) => ({ key: f.id, status: f.status, severity: f.severity, ruleId: f.ruleId, category: f.category, sheet: f.sheet, row: f.row, rowLabel: f.row ? String(f.row) : '—', field: f.field, actual: f.actual, expected: f.expected, message: f.message })),
      ...report.passedRules.map((p) => ({ key: `P|${p.ruleId}`, status: 'passed' as const, severity: p.severity, ruleId: p.ruleId, category: p.category, sheet: p.sheet, row: null, rowLabel: `${p.passedCount} rows`, field: p.field, actual: '—', expected: p.expected, message: `All ${p.passedCount} evaluated cells passed.` })),
    ],
    [report],
  );
  const sheets = [...new Set(rows.map((r) => r.sheet))];
  const fields = [...new Set(rows.filter((r) => !sheet || r.sheet === sheet).map((r) => r.field))].sort();

  const filtered = rows.filter(
    (r) =>
      (status === 'all' || (status === 'issues' ? r.status !== 'passed' : r.status === status)) &&
      (!sheet || r.sheet === sheet) &&
      (!field || r.field === field) &&
      (!severity || r.severity === severity) &&
      (!category || r.category === category) &&
      (!q || [r.ruleId, r.field, r.actual, r.message].some((x) => x.toLowerCase().includes(q.toLowerCase()))),
  );
  filtered.sort((a, b) => {
    const rank = { failed: 0, warning: 1, passed: 2 };
    const sev = { critical: 0, major: 1, minor: 2 };
    return rank[a.status] - rank[b.status] || sev[a.severity] - sev[b.severity] || a.sheet.localeCompare(b.sheet) || (a.row ?? 0) - (b.row ?? 0);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice((page - 1) * PAGE, page * PAGE);
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    fn(e.target.value);
    setPage(1);
  };
  const counts = { failed: report.totals.failedChecks, warning: report.totals.warningChecks, passed: report.passedRules.length };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs" role="group" aria-label="Filter by status">
          {[
            ['issues', 'Issues'],
            ['failed', `Failed (${counts.failed})`],
            ['warning', `Warnings (${counts.warning})`],
            ['passed', `Passed rules (${counts.passed})`],
            ['all', 'All'],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={status === k}
              onClick={() => {
                setStatus(k);
                setPage(1);
              }}
              className={cn('cursor-pointer border-r border-slate-300 px-3 py-1.5 last:border-r-0', status === k ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
            >
              {l}
            </button>
          ))}
        </div>
        <Select aria-label="Worksheet" className="h-8 w-auto text-xs" value={sheet} onChange={reset((v) => (setSheet(v), setField('')))}>
          <option value="">All worksheets</option>
          {sheets.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Field" className="h-8 w-auto max-w-48 text-xs" value={field} onChange={reset(setField)}>
          <option value="">All fields</option>
          {fields.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Severity" className="h-8 w-auto text-xs" value={severity} onChange={reset(setSeverity)}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
        </Select>
        <Select aria-label="Category" className="h-8 w-auto text-xs" value={category} onChange={reset(setCategory)}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <div className="relative ml-auto min-w-44">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search findings" placeholder="Search rule, value…" className="h-8 pl-8 text-xs" value={q} onChange={reset(setQ)} maxLength={80} />
        </div>
      </div>
      {view.length === 0 ? (
        <EmptyState title={status === 'issues' ? 'No failed checks or warnings' : 'No checks match the filters'} description={status === 'issues' ? 'Every evaluated rule passed for this report.' : undefined} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Location</Th>
              <Th>Field</Th>
              <Th>Actual value</Th>
              <Th>Expected / requirement</Th>
              <Th className="min-w-56">Description</Th>
              <Th>
                <span className="sr-only">Row details</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.key} className={cn(r.status === 'failed' && 'bg-fail-soft/40', r.status === 'warning' && 'bg-warn-soft/40')}>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <CheckBadge status={r.status} />
                    <SeverityBadge severity={r.severity} />
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {r.sheet}
                  <span className="block font-mono text-[11px] text-slate-500">{r.row ? `Row ${r.row}` : r.rowLabel}</span>
                </Td>
                <Td className="max-w-36 text-xs font-medium">{r.field}</Td>
                <Td className={cn('max-w-32 truncate font-mono text-xs', r.status === 'failed' && 'text-fail', r.status === 'warning' && 'text-warn')} title={r.actual}>
                  {r.actual}
                </Td>
                <Td className="max-w-40 truncate text-xs text-slate-500" title={r.expected}>
                  {r.expected}
                </Td>
                <Td className="text-xs">
                  {r.message}
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                    {r.ruleId} · {CATEGORY_LABEL[r.category]}
                  </span>
                </Td>
                <Td>
                  {r.row !== null && (
                    <Button variant="ghost" size="icon" aria-label={`View row ${r.row} details`} onClick={() => setDetail({ sheet: r.sheet, row: r.row! })}>
                      <Eye />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-slate-500">
        <span>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          {status !== 'passed' && ' · passed checks are aggregated per rule'}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      <RowDetailDialog report={report} target={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

export function RowDetailDialog({ report, target, onClose }: { report: ValidationReport; target: { sheet: string; row: number } | null; onClose: () => void }) {
  const snapshot = target ? report.rowSnapshots?.find((s) => s.sheet === target.sheet && s.row === target.row) : null;
  const rowFindings = target ? report.findings.filter((f) => f.sheet === target.sheet && f.row === target.row) : [];
  const fieldStatus = (h: string) => {
    const fs = rowFindings.filter((f) => f.field === h || f.field.split(' vs ').includes(h));
    if (fs.some((f) => f.status === 'failed')) return 'failed';
    if (fs.length) return 'warning';
    return 'passed';
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>
            {target?.sheet} · Excel row {target?.row}
          </DialogTitle>
          <DialogDescription>
            {rowFindings.filter((f) => f.status === 'failed').length} failed and {rowFindings.filter((f) => f.status === 'warning').length} warning check(s) on this row. Failing fields are highlighted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {snapshot ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(snapshot.values).map(([h, v]) => {
                const st = fieldStatus(h);
                return (
                  <div key={h} className={cn('rounded-md border px-3 py-2', st === 'failed' ? 'border-[#f5c2c2] bg-fail-soft' : st === 'warning' ? 'border-[#f6d999] bg-warn-soft' : 'border-slate-200 bg-white')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">{h}</span>
                      {st !== 'passed' && <CheckBadge status={st} />}
                    </div>
                    <p className={cn('mt-0.5 break-all font-mono text-sm', st === 'failed' ? 'text-fail' : st === 'warning' ? 'text-warn' : 'text-slate-800')}>{v}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Cell values for this row were not retained in the report.</p>
          )}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Findings</h4>
            <ul className="space-y-2">
              {rowFindings.map((f) => (
                <li key={f.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm">
                  <CheckBadge status={f.status} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{f.message}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {f.field}: <span className="font-mono">{f.actual}</span> → expected <span className="font-mono">{f.expected}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {f.ruleId} · {report.requirementCode} {report.requirementVersion}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

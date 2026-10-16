import { CircleCheck, CircleX, Database, FlaskConical, Rows3, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/primitives';
import { CATEGORY_LABEL } from '@/lib/labels';
import { cn, formatDate, pct } from '@/lib/utils';
import type { OverallValidation, ValidationReport } from '@/types';

export function OverallBadge({ overall, large }: { overall: OverallValidation; large?: boolean }) {
  const cls = large ? 'px-3 py-1 text-xs' : '';
  if (overall === 'passed') return <Badge tone="ok" icon={CircleCheck} className={cls}>Validation passed</Badge>;
  if (overall === 'passed_with_warnings') return <Badge tone="warn" icon={TriangleAlert} className={cls}>Passed with warnings</Badge>;
  return <Badge tone="fail" icon={CircleX} className={cls}>Validation failed</Badge>;
}

function Metric({ label, value, tone, sub }: { label: string; value: number; tone?: 'ok' | 'warn' | 'fail'; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'fail' ? 'text-fail' : 'text-navy-950')}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

export function ValidationSummary({ report, compact }: { report: ValidationReport; compact?: boolean }) {
  const t = report.totals;
  const passRate = pct(t.passedChecks, t.checksPerformed);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <OverallBadge overall={report.overall} large />
        <span>
          {report.requirementCode} {report.requirementVersion} · {report.revision} · run {formatDate(report.runAt, true)}
        </span>
        {report.scope === 'partial' && <Badge tone="warn" icon={TriangleAlert}>Partial scope: {report.sheetsValidated.join(', ')}</Badge>}
        {report.synthetic && <Badge tone="neutral" icon={FlaskConical}>Synthetic sample data</Badge>}
      </div>
      <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6')}>
        <Metric label="Rows checked" value={t.rowsChecked} />
        <Metric label="Rules checked" value={t.rulesChecked} />
        <Metric label="Passed checks" value={t.passedChecks} tone="ok" sub={compact ? undefined : `${passRate}% pass rate`} />
        <Metric label="Failed checks" value={t.failedChecks} tone={t.failedChecks ? 'fail' : undefined} sub={`${t.criticalFailures} critical`} />
        <Metric label="Warnings" value={t.warningChecks} tone={t.warningChecks ? 'warn' : undefined} />
        <Metric label="Failing rows" value={t.failingRows} tone={t.failingRows ? 'fail' : undefined} sub="unique rows" />
      </div>
    </div>
  );
}

export function CategoryBreakdown({ report }: { report: ValidationReport }) {
  const rows = report.byCategory.filter((c) => c.passed + c.failed + c.warnings > 0);
  return (
    <Card>
      <div className="border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Database className="size-4 text-slate-400" /> Checks by category
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((c) => {
          const total = c.passed + c.failed + c.warnings;
          return (
            <li key={c.category} className="px-5 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{CATEGORY_LABEL[c.category]}</span>
                <span className="tabular-nums text-slate-500">
                  <span className="text-ok">{c.passed}</span> · <span className={c.failed ? 'text-fail' : ''}>{c.failed}</span> · <span className={c.warnings ? 'text-warn' : ''}>{c.warnings}</span>
                </span>
              </div>
              <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <span className="bg-[#0ca30c]" style={{ width: `${(c.passed / total) * 100}%` }} />
                <span className="bg-[#fab219]" style={{ width: `${(c.warnings / total) * 100}%` }} />
                <span className="bg-[#d03b3b]" style={{ width: `${(c.failed / total) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-5 py-2 text-[10px] text-slate-400">passed · failed · warnings</p>
    </Card>
  );
}

export function SheetBreakdown({ report }: { report: ValidationReport }) {
  return (
    <Card>
      <div className="border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Rows3 className="size-4 text-slate-400" /> Worksheets
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {report.bySheet.map((s) => (
          <li key={s.sheet} className="flex items-center justify-between gap-2 px-5 py-2.5 text-xs">
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-700">{s.sheet}</span>
              <span className="text-slate-400">{s.rows} rows</span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              {s.failed > 0 && <Badge tone="fail">{s.failingRows} failing rows</Badge>}
              {s.warnings > 0 && <Badge tone="warn">{s.warnings} warnings</Badge>}
              {s.failed === 0 && s.warnings === 0 && <Badge tone="ok" icon={CircleCheck}>Clean</Badge>}
            </span>
          </li>
        ))}
        {report.findings.filter((f) => f.category === 'required_structure' && f.field === '(worksheet)').map((f) => (
          <li key={f.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
            <span className="font-medium text-slate-700">{f.sheet}</span>
            <Badge tone="fail" icon={CircleX}>Missing</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

import { FileText, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { Badge } from '@/components/StatusBadge';
import { Card, Input, Select, Table, Td, Th } from '@/components/ui/primitives';
import { OverallBadge } from '@/features/validation/ValidationSummary';
import { useReports } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';

export function ReportsPage() {
  const reports = useReports();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [overall, setOverall] = useState('');
  const rows = (reports.data ?? []).filter((r) => (!overall || r.overall === overall) && (!q || `${r.docNumber} ${r.title} ${r.requirementCode}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHeader title="Validation reports" description="Every automated validation run is retained, including runs on superseded revisions." crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Validation Reports' }]} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search document or requirement…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" maxLength={100} />
          </div>
          <Select className="w-auto" value={overall} onChange={(e) => setOverall(e.target.value)} aria-label="Result">
            <option value="">All results</option>
            <option value="passed">Passed</option>
            <option value="passed_with_warnings">Passed with warnings</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
        {reports.isLoading ? (
          <LoadingBlock />
        ) : reports.isError ? (
          <ErrorState error={reports.error} onRetry={() => reports.refetch()} className="m-4" />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title="No reports found" description="Run a validation from the chatbot to generate a report." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Requirement</Th>
                <Th>Run</Th>
                <Th>Result</Th>
                <Th className="text-right">Passed</Th>
                <Th className="text-right">Failed</Th>
                <Th className="text-right">Warnings</Th>
                <Th className="text-right">Failing rows</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/reports/${r.id}`)}>
                  <Td>
                    <Link to={`/reports/${r.id}`} className="font-medium text-slate-900 hover:text-navy-700" onClick={(e) => e.stopPropagation()}>
                      {r.title}
                    </Link>
                    <span className="block text-[11px] text-slate-500">
                      <span className="font-mono">{r.docNumber}</span> · {r.revision} (v{r.versionNo}) {r.scope === 'partial' && <Badge tone="warn">partial</Badge>} {r.synthetic && <Badge tone="neutral">synthetic</Badge>}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {r.requirementCode} {r.requirementVersion}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{formatDate(r.runAt, true)}</Td>
                  <Td>
                    <OverallBadge overall={r.overall} />
                  </Td>
                  <Td className="text-right tabular-nums text-ok">{r.totals.passedChecks}</Td>
                  <Td className="text-right tabular-nums text-fail">{r.totals.failedChecks}</Td>
                  <Td className="text-right tabular-nums text-warn">{r.totals.warningChecks}</Td>
                  <Td className="text-right tabular-nums">{r.totals.failingRows}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

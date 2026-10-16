import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState, PageHeader, PageLoading, StatCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, Td, Th } from '@/components/ui/primitives';
import { ProjectStatusChart, TurnaroundChart, ValidationTrendChart, WorkloadChart } from '@/features/charts/Charts';
import { safeCell } from '@/features/validation/exportReport';
import { useManagerStats, useReports } from '@/hooks/queries';
import { CATEGORY_LABEL } from '@/lib/labels';
import { pct } from '@/lib/utils';
import { CircleCheck, CircleX, Gauge, Timer } from 'lucide-react';
import type { ValidationCategory } from '@/types';

export function AnalyticsPage() {
  const stats = useManagerStats();
  const reports = useReports();
  if (stats.isLoading || reports.isLoading) return <PageLoading />;
  if (stats.isError) return <ErrorState error={stats.error} />;
  if (reports.isError) return <ErrorState error={reports.error} />;
  const s = stats.data!;
  const r = reports.data!;
  const passedRuns = r.filter((x) => x.overall !== 'failed').length;
  const firstTime = (() => {
    const byDoc = new Map<string, typeof r>();
    r.forEach((x) => byDoc.set(x.documentId, [...(byDoc.get(x.documentId) ?? []), x]));
    const firsts = [...byDoc.values()].map((list) => list.sort((a, b) => a.runAt.localeCompare(b.runAt))[0]);
    return pct(firsts.filter((x) => x.overall !== 'failed').length, firsts.length);
  })();
  const cats = new Map<ValidationCategory, { failed: number; warnings: number }>();
  r.forEach((x) => x.byCategory.forEach((c) => {
    const cur = cats.get(c.category) ?? { failed: 0, warnings: 0 };
    cats.set(c.category, { failed: cur.failed + c.failed, warnings: cur.warnings + c.warnings });
  }));
  const catRows = [...cats.entries()].filter(([, v]) => v.failed + v.warnings > 0).sort((a, b) => b[1].failed - a[1].failed);

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.byProject.map((p) => ({ Project: safeCell(p.projectCode), Name: safeCell(p.projectName), 'In progress': p.inProgress, Awaiting: p.awaiting, Approved: p.approved, 'Changes requested': p.changes }))), 'By project');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.workload.map((w) => ({ Engineer: safeCell(w.name), Active: w.active, Awaiting: w.awaiting, Approved: w.completed }))), 'Workload');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.trend.map((t) => ({ Week: t.label, Passed: t.passed, 'Passed with warnings': t.warnings, Failed: t.failed }))), 'Validation trend');
    XLSX.writeFile(wb, 'DIPA_analytics.xlsx');
    toast.success('Analytics exported');
  };

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        description="Validation quality, approval throughput and workload across the portfolio."
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Reports & Analytics' }]}
        actions={
          <Button variant="outline" onClick={exportXlsx}>
            <Download /> Export (.xlsx)
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Validation runs" value={r.length} icon={Gauge} />
        <StatCard label="Runs passing" value={`${pct(passedRuns, r.length)}%`} icon={CircleCheck} tone="ok" hint={`${passedRuns} of ${r.length}`} />
        <StatCard label="First-time pass rate" value={`${firstTime}%`} icon={CircleX} tone="warn" hint="First run per document" />
        <StatCard label="Avg. approval turnaround" value={`${s.turnaround.avgHours} h`} icon={Timer} tone="accent" hint={`${s.turnaround.within48hPct}% within 48 h`} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Validation pass / fail trend</CardTitle>
              <CardDescription>Runs per week by outcome</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ValidationTrendChart data={s.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Approval turnaround</CardTitle>
              <CardDescription>Average hours from submission to decision, per week</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TurnaroundChart data={s.turnaround.byWeek} height={260} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Project-wise status</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectStatusChart data={s.byProject} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Engineer workload</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkloadChart data={s.workload} height={260} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Findings by validation category</CardTitle>
              <CardDescription>Across all retained validation runs</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Failed checks</Th>
                <Th className="text-right">Warnings</Th>
                <Th className="w-1/3">Share of failures</Th>
              </tr>
            </thead>
            <tbody>
              {catRows.map(([c, v]) => {
                const totalFailed = catRows.reduce((a, [, x]) => a + x.failed, 0);
                return (
                  <tr key={c}>
                    <Td className="font-medium">{CATEGORY_LABEL[c]}</Td>
                    <Td className="text-right tabular-nums text-fail">{v.failed}</Td>
                    <Td className="text-right tabular-nums text-warn">{v.warnings}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#d03b3b]" style={{ width: `${pct(v.failed, totalFailed)}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct(v.failed, totalFailed)}%</span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

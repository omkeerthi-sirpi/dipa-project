import { ArrowRight, Bot, CircleCheck, CircleX, ClipboardCheck, Clock, FileSpreadsheet, Hourglass, Inbox, PackageCheck, ShieldCheck, Undo2, Upload, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { AuditTimeline, keyEvents } from '@/components/AuditTimeline';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatCard } from '@/components/common';
import { DocumentTable } from '@/components/DocumentTable';
import { StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { ProjectStatusChart, ValidationTrendChart } from '@/features/charts/Charts';
import { useAudit, useDocuments, useEngineerStats, useManagerStats, useSession } from '@/hooks/queries';
import { relativeTime } from '@/lib/utils';

export function DashboardPage() {
  const { data: session } = useSession();
  return session?.user.role === 'manager' ? <ManagerDashboard /> : <EngineerDashboard />;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ViewAll({ to, label = 'View all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800">
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );
}

function ActivityCard() {
  const audit = useAudit({ limit: 30 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <ViewAll to="/audit" label="Audit history" />
      </CardHeader>
      <CardContent>{audit.isLoading ? <LoadingBlock rows={4} className="p-0" /> : <AuditTimeline events={keyEvents(audit.data)} showDocument compact />}</CardContent>
    </Card>
  );
}

function EngineerDashboard() {
  const { data: session } = useSession();
  const stats = useEngineerStats();
  const recent = useDocuments({ mine: true, sort: 'updatedAt', dir: 'desc', pageSize: 6 });
  const attention = useDocuments({ mine: true, stage: ['changes_requested', 'validation_failed', 'uploaded', 'ready_for_review'], pageSize: 5 });
  const s = stats.data;
  const continueDoc = attention.data?.items.find((d) => d.stage === 'uploaded' || d.stage === 'validation_failed');
  const linkFor = (stage: string, id: string) => (stage === 'ready_for_review' ? `/manual-testing/${id}` : stage === 'changes_requested' ? `/documents/${id}` : `/validate/${id}`);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${session?.user.name.split(' ')[0]}`}
        description="Here's where your documents stand today."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={continueDoc ? `/validate/${continueDoc.id}` : '/validate'}>
                <Bot /> Continue validation
              </Link>
            </Button>
            <Button variant="accent" asChild>
              <Link to="/upload">
                <Upload /> Upload document
              </Link>
            </Button>
          </>
        }
      />
      {stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total documents" value={s?.total ?? 0} icon={FileSpreadsheet} loading={!s} to="/documents" />
          <StatCard label="Pending validation" value={s?.pendingValidation ?? 0} icon={Clock} tone="slate" loading={!s} to="/documents?group=pending_validation" />
          <StatCard label="Validation completed" value={s?.validationCompleted ?? 0} icon={CircleCheck} tone="ok" loading={!s} to="/documents?group=validation_completed" />
          <StatCard label="Failed" value={s?.failed ?? 0} icon={CircleX} tone="fail" loading={!s} to="/documents?group=failed" />
          <StatCard label="Pending manual testing" value={s?.pendingManual ?? 0} icon={ClipboardCheck} tone="warn" loading={!s} to="/documents?group=pending_manual" />
          <StatCard label="Submitted for approval" value={s?.submitted ?? 0} icon={Hourglass} tone="accent" loading={!s} to="/documents?group=submitted" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs your attention</CardTitle>
              <CardDescription>Next action is on you</CardDescription>
            </div>
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {attention.isLoading && <LoadingBlock rows={3} />}
            {attention.data?.items.length === 0 && <EmptyState icon={ShieldCheck} title="All clear" description="Nothing is waiting on you." />}
            {attention.data?.items.map((d) => (
              <Link key={d.id} to={linkFor(d.stage, d.id)} className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StageBadge stage={d.stage} />
                    <span className="text-[11px] text-slate-400">{relativeTime(d.updatedAt)}</span>
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-slate-300 group-hover:text-navy-500" />
              </Link>
            ))}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent documents</CardTitle>
            <ViewAll to="/documents" />
          </CardHeader>
          {recent.isLoading ? (
            <LoadingBlock />
          ) : recent.data?.items.length ? (
            <DocumentTable rows={recent.data.items} compact />
          ) : (
            <EmptyState title="No documents yet" action={<Button asChild size="sm"><Link to="/upload">Upload your first document</Link></Button>} />
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Validation outcomes</CardTitle>
              <CardDescription>Runs per week, last 8 weeks</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s ? <ValidationTrendChart data={s.trend} /> : <Skeleton className="h-[260px]" />}</CardContent>
        </Card>
        <ActivityCard />
      </div>
    </>
  );
}

function ManagerDashboard() {
  const stats = useManagerStats();
  const queue = useDocuments({ stage: 'pending_approval', sort: 'updatedAt', dir: 'asc', pageSize: 6 });
  const s = stats.data;
  return (
    <>
      <PageHeader
        title="Overview"
        description="Approvals, project status and team throughput across your portfolio."
        actions={
          <Button variant="accent" asChild>
            <Link to="/approvals">
              <Inbox /> Approval queue{s ? ` (${s.awaitingApproval})` : ''}
            </Link>
          </Button>
        }
      />
      {stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Under management" value={s?.total ?? 0} icon={FileSpreadsheet} loading={!s} to="/documents" />
          <StatCard label="Awaiting approval" value={s?.awaitingApproval ?? 0} icon={Hourglass} tone="accent" loading={!s} to="/approvals" />
          <StatCard label="Approved" value={s?.approved ?? 0} icon={ShieldCheck} tone="ok" loading={!s} to="/approved" />
          <StatCard label="Changes requested" value={s?.rejected ?? 0} icon={Undo2} tone="warn" loading={!s} to="/documents?group=rejected" />
          <StatCard label="With engineers" value={s?.pendingEngineer ?? 0} icon={Wrench} tone="slate" loading={!s} to="/documents?group=pending_engineer" />
          <StatCard label="Ready for vendor" value={s?.vendorReady ?? 0} icon={PackageCheck} tone="navy" loading={!s} to="/vendor?tab=ready" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>Oldest submissions first</CardDescription>
            </div>
            <ViewAll to="/approvals" label="Open queue" />
          </CardHeader>
          {queue.isLoading ? (
            <LoadingBlock rows={4} />
          ) : queue.data?.items.length ? (
            <DocumentTable rows={queue.data.items} showOwner compact />
          ) : (
            <EmptyState icon={Inbox} title="Queue is clear" description="No documents are awaiting your approval." />
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Approval turnaround</CardTitle>
              <ViewAll to="/analytics" label="Analytics" />
            </CardHeader>
            <CardContent>
              {s ? (
                <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  {[
                    ['Average', `${s.turnaround.avgHours}h`],
                    ['Median', `${s.turnaround.medianHours}h`],
                    ['Within 48h', `${s.turnaround.within48hPct}%`],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <p className="text-xl font-semibold tabular-nums text-navy-950">{v}</p>
                      <p className="text-[11px] text-slate-500">{l}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <Skeleton className="h-12" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Engineer workload</CardTitle>
            </CardHeader>
            {s ? (
              <ul className="divide-y divide-slate-100">
                {s.workload.map((w) => (
                  <li key={w.engineerId}>
                    <Link to={`/documents?engineer=${w.engineerId}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                      <span className="grid size-7 place-items-center rounded-full bg-navy-50 text-[11px] font-semibold text-navy-700">
                        {w.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                      <span className="flex-1 truncate text-slate-800">{w.name}</span>
                      <span className="text-xs tabular-nums text-slate-500" title="Active · awaiting approval · approved">
                        <strong className="font-semibold text-slate-800">{w.active}</strong> active · {w.awaiting} awaiting · {w.completed} approved
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <LoadingBlock rows={3} />
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Status by project</CardTitle>
            <ViewAll to="/projects" label="Projects" />
          </CardHeader>
          <CardContent>{s ? <ProjectStatusChart data={s.byProject} /> : <Skeleton className="h-[260px]" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Validation trend</CardTitle>
              <CardDescription>Runs per week</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s ? <ValidationTrendChart data={s.trend} /> : <Skeleton className="h-[260px]" />}</CardContent>
        </Card>
        <ActivityCard />
      </div>
    </>
  );
}

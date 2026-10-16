import { FolderKanban, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState, PageHeader, PageLoading } from '@/components/common';
import { Badge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { SERIES } from '@/features/charts/Charts';
import { useManagerStats, useProjects } from '@/hooks/queries';

export function ProjectsPage() {
  const projects = useProjects();
  const stats = useManagerStats();
  if (projects.isLoading || stats.isLoading) return <PageLoading />;
  if (projects.isError) return <ErrorState error={projects.error} />;
  if (stats.isError) return <ErrorState error={stats.error} />;
  return (
    <>
      <PageHeader title="Project overview" description="Document assurance status for each project in your portfolio." crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Project Overview' }]} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {projects.data!.map((p) => {
          const s = stats.data!.byProject.find((b) => b.projectCode === p.code)!;
          const total = s.inProgress + s.awaiting + s.changes + s.approved;
          const seg = [
            ['In progress', s.inProgress, SERIES[0]],
            ['Awaiting approval', s.awaiting, SERIES[1]],
            ['Approved', s.approved, SERIES[2]],
            ['Changes requested', s.changes, SERIES[3]],
          ] as const;
          return (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-navy-600">{p.code}</p>
                  <h2 className="mt-0.5 text-base font-semibold text-slate-900">{p.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="size-3.5" /> {p.location}
                  </p>
                </div>
                <Badge tone="info">{p.phase}</Badge>
              </div>
              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                  <span>{total} documents</span>
                  <span>{total ? Math.round((s.approved / total) * 100) : 0}% approved</span>
                </div>
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={seg.map(([l, v]) => `${l}: ${v}`).join(', ')}>
                  {seg.map(([l, v, c]) => (v ? <span key={l} style={{ width: `${(v / total) * 100}%`, background: c }} /> : null))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                  {seg.map(([l, v, c]) => (
                    <li key={l} className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: c }} aria-hidden /> {l} <span className="ml-auto font-medium tabular-nums text-slate-800">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Assets</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.assets.map((a) => (
                    <span key={a.id} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" title={a.name}>
                      {a.tag}
                    </span>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-5 self-start" asChild>
                <Link to={`/documents?project=${p.id}`}>
                  <FolderKanban /> View project documents
                </Link>
              </Button>
            </Card>
          );
        })}
      </div>
    </>
  );
}

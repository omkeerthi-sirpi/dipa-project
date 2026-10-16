import { Hourglass, PackageCheck, Send, Undo2, UserCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader, StatCard } from '@/components/common';
import { DocumentBrowser } from '@/components/DocumentTable';
import { useDocuments } from '@/hooks/queries';
import type { WorkflowStage } from '@/types';

const TRACKED: WorkflowStage[] = ['ready_for_review', 'pending_approval', 'changes_requested', 'vendor_ready', 'vendor_submitted'];

export function TrackingPage() {
  const [params] = useSearchParams();
  const stage = params.get('stage') as WorkflowStage | null;
  const all = useDocuments({ mine: true, stage: TRACKED, pageSize: 100 });
  const count = (s: WorkflowStage) => all.data?.items.filter((d) => d.stage === s).length ?? 0;
  return (
    <>
      <PageHeader title="Approval tracking" description="Follow your submissions through manager review and vendor handover." crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Approval Tracking' }]} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Ready to submit" value={count('ready_for_review')} icon={UserCheck} tone="accent" loading={all.isLoading} to="/tracking?stage=ready_for_review" />
        <StatCard label="Awaiting decision" value={count('pending_approval')} icon={Hourglass} tone="accent" loading={all.isLoading} to="/tracking?stage=pending_approval" />
        <StatCard label="Changes requested" value={count('changes_requested')} icon={Undo2} tone="warn" loading={all.isLoading} to="/tracking?stage=changes_requested" />
        <StatCard label="Approved — vendor ready" value={count('vendor_ready')} icon={PackageCheck} tone="ok" loading={all.isLoading} to="/tracking?stage=vendor_ready" />
        <StatCard label="Vendor submitted" value={count('vendor_submitted')} icon={Send} tone="navy" loading={all.isLoading} to="/tracking?stage=vendor_submitted" />
      </div>
      <DocumentBrowser fixed={{ mine: true, stage: stage && TRACKED.includes(stage) ? stage : TRACKED }} hideFilters={['stage']} />
    </>
  );
}

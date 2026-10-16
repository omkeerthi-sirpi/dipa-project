import { PageHeader } from '@/components/common';
import { DocumentBrowser } from '@/components/DocumentTable';

export function ApprovalQueuePage() {
  return (
    <>
      <PageHeader
        title="Approval queue"
        description="Documents submitted by engineers and awaiting your decision. Oldest submissions are shown first."
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Approval Queue' }]}
      />
      <DocumentBrowser fixed={{ stage: 'pending_approval' }} showOwner hideFilters={['stage']} defaultSort={{ sort: 'updatedAt', dir: 'asc' }} linkFor={(d) => `/review/${d.id}`} />
    </>
  );
}

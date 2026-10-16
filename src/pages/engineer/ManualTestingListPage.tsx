import { ClipboardCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { DocumentTable } from '@/components/DocumentTable';
import { Card } from '@/components/ui/primitives';
import { useDocuments } from '@/hooks/queries';

export function ManualTestingListPage() {
  const docs = useDocuments({ mine: true, stage: ['validation_passed', 'validation_failed', 'manual_testing', 'ready_for_review'], sort: 'updatedAt', dir: 'desc', pageSize: 50 });
  // Documents with critical failures must be corrected first, so they are not testable.
  const rows = docs.data?.items.filter((d) => !d.criticalFailures) ?? [];
  return (
    <>
      <PageHeader
        title="Manual testing"
        description="Validated documents awaiting manual verification before submission."
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Manual Testing' }]}
      />
      <Card>
        {docs.isLoading ? (
          <LoadingBlock />
        ) : docs.isError ? (
          <ErrorState error={docs.error} onRetry={() => docs.refetch()} className="m-4" />
        ) : rows.length ? (
          <DocumentTable rows={rows} linkFor={(d) => `/manual-testing/${d.id}`} />
        ) : (
          <EmptyState icon={ClipboardCheck} title="Nothing to test" description="Validated documents will appear here." />
        )}
      </Card>
    </>
  );
}

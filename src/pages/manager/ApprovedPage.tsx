import { PageHeader } from '@/components/common';
import { DocumentBrowser } from '@/components/DocumentTable';

export function ApprovedPage() {
  return (
    <>
      <PageHeader
        title="Approved documents"
        description="Documents with an approval recorded against their current version, including those already issued to vendors."
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Approved Documents' }]}
      />
      <DocumentBrowser fixed={{ stageGroup: 'approved' }} showOwner hideFilters={['stage']} />
    </>
  );
}

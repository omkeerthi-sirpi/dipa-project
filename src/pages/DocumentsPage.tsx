import { Upload } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/common';
import { DocumentBrowser } from '@/components/DocumentTable';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/queries';

export function DocumentsPage() {
  const { data: session } = useSession();
  const manager = session?.user.role === 'manager';
  return (
    <>
      <PageHeader
        title={manager ? 'All documents' : 'My documents'}
        description={manager ? 'Every engineering document in the projects you manage.' : 'Documents you own across your projects. Click a row for version history, reports, approvals and activity.'}
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: manager ? 'All Documents' : 'My Documents' }]}
        actions={
          !manager && (
            <Button variant="accent" asChild>
              <Link to="/upload">
                <Upload /> Upload document
              </Link>
            </Button>
          )
        }
      />
      <DocumentBrowser fixed={manager ? {} : { mine: true }} showOwner={manager} />
    </>
  );
}

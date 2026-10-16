import { PackageCheck, Send } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common';
import { DocumentBrowser } from '@/components/DocumentTable';
import { cn } from '@/lib/utils';
import { useDocuments } from '@/hooks/queries';

export function VendorListPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'submitted' ? 'submitted' : 'ready';
  const ready = useDocuments({ stage: 'vendor_ready', pageSize: 1 });
  const submitted = useDocuments({ stage: 'vendor_submitted', pageSize: 1 });
  const tabs = [
    { key: 'ready', label: 'Ready for submission', icon: PackageCheck, count: ready.data?.total },
    { key: 'submitted', label: 'Submitted', icon: Send, count: submitted.data?.total },
  ];
  return (
    <>
      <PageHeader title="Vendor submissions" description="Approved documents ready for handover, and transmittals already issued (simulated)." crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Vendor Submissions' }]} />
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={cn('-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium', tab === t.key ? 'border-accent text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800')}
          >
            <t.icon className="size-4" /> {t.label}
            {t.count !== undefined && <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600">{t.count}</span>}
          </button>
        ))}
      </div>
      <DocumentBrowser key={tab} fixed={{ stage: tab === 'ready' ? 'vendor_ready' : 'vendor_submitted' }} showOwner hideFilters={['stage']} linkFor={(d) => `/vendor/${d.id}`} />
    </>
  );
}

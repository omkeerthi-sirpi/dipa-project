import { Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { Card, CardContent, Input, Select } from '@/components/ui/primitives';
import { useAudit, useSession } from '@/hooks/queries';
import { AUDIT_LABEL } from '@/lib/labels';

export function AuditPage() {
  const { data: session } = useSession();
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const audit = useAudit({ action: action || undefined, limit: 300 });
  const rows = (audit.data ?? []).filter((e) => !q || `${e.docNumber ?? ''} ${e.actorName} ${e.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader
        title="Audit history"
        description={session?.user.role === 'manager' ? 'Every recorded action across the projects you manage, including denied access attempts.' : 'Every recorded action on your documents.'}
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Audit History' }]}
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search document, person or detail…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} aria-label="Search audit events" />
          </div>
          <Select className="w-auto" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
            <option value="">All actions</option>
            {Object.entries(AUDIT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <CardContent>{audit.isLoading ? <LoadingBlock className="p-0" /> : audit.isError ? <ErrorState error={audit.error} onRetry={() => audit.refetch()} /> : <AuditTimeline events={rows} showDocument emptyText="No events match the filters." />}</CardContent>
        <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-[11px] text-slate-400">
          <ShieldCheck className="size-3.5" /> Prototype audit log stored in browser storage. Production audit records must be append-only and tamper-resistant on the server.
        </p>
      </Card>
    </>
  );
}

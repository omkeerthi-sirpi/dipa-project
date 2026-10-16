import { Bell, CheckCheck } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/queries';
import { cn, formatDate } from '@/lib/utils';

export function NotificationsPage() {
  const n = useNotifications();
  const mark = useMarkNotificationsRead();
  return (
    <>
      <PageHeader
        title="Notifications"
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Notifications' }]}
        actions={
          <Button variant="outline" onClick={() => mark.mutate(undefined)} disabled={!n.data?.some((x) => !x.read)}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      <Card>
        {n.isLoading ? (
          <LoadingBlock />
        ) : n.isError ? (
          <ErrorState error={n.error} onRetry={() => n.refetch()} className="m-4" />
        ) : !n.data?.length ? (
          <EmptyState icon={Bell} title="No notifications" description="Workflow updates for your documents will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {n.data.map((x) => (
              <li key={x.id}>
                <Link to={x.link} onClick={() => !x.read && mark.mutate([x.id])} className={cn('flex gap-3 px-5 py-4 hover:bg-slate-50', !x.read && 'bg-accent-soft/30')}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', x.read ? 'bg-slate-200' : 'bg-accent')} aria-label={x.read ? 'Read' : 'Unread'} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{x.title}</span>
                    <span className="block text-sm text-slate-500">{x.body}</span>
                  </span>
                  <time className="shrink-0 text-xs text-slate-400">{formatDate(x.createdAt, true)}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

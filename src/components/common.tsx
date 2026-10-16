import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleAlert, FlaskConical, Inbox, Lock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { errorMessage, isApiError } from '@/services/apiError';
import { Button } from './ui/button';
import { Card, Skeleton } from './ui/primitives';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, description, crumbs, actions, badge }: { title: string; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="no-print mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-slate-300" aria-hidden />}
              {c.to ? (
                <Link to={c.to} className="hover:text-navy-700 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-slate-700" aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-navy-950">{title}</h1>
            {badge}
          </div>
          {description && <div className="mt-1 max-w-3xl text-sm text-slate-500">{description}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'navy', hint, to, loading }: { label: string; value: number | string; icon: LucideIcon; tone?: 'navy' | 'ok' | 'warn' | 'fail' | 'accent' | 'slate'; hint?: string; to?: string; loading?: boolean }) {
  const toneClass = {
    navy: 'bg-navy-50 text-navy-700',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    fail: 'bg-fail-soft text-fail',
    accent: 'bg-accent-soft text-accent',
    slate: 'bg-slate-100 text-slate-600',
  }[tone];
  const body = (
    <Card className={cn('group h-full px-4 py-3.5 transition', to && 'hover:-translate-y-px hover:border-navy-300 hover:shadow-md')}>
      <div className="flex items-start justify-between gap-2">
        {loading ? <Skeleton className="h-8 w-10" /> : <p className="text-2xl font-semibold leading-8 tabular-nums text-navy-950">{value}</p>}
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', toneClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-1 text-xs font-medium leading-snug text-slate-500 group-hover:text-navy-700">{label}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-lg focus-visible:outline-2" aria-label={`${label}: ${value}. Open filtered list`}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const forbidden = isApiError(error) && error.status === 403;
  const notFound = isApiError(error) && error.status === 404;
  return (
    <Card className={cn('p-0', className)}>
      <EmptyState
        icon={forbidden ? Lock : CircleAlert}
        title={forbidden ? 'Access denied' : notFound ? 'Not found' : 'Unable to load data'}
        description={forbidden ? 'You do not have permission to view this item. The attempt has been recorded in the audit log.' : errorMessage(error)}
        action={
          onRetry && !forbidden && !notFound ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw /> Retry
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          )
        }
      />
    </Card>
  );
}

export function LoadingBlock({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-5', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

/** Labels a feature as simulated/mock so nothing is mistaken for production behaviour. */
export function MockTag({ children = 'Simulated', className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-dashed border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500', className)}>
      <FlaskConical className="size-3" aria-hidden />
      {children}
    </span>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

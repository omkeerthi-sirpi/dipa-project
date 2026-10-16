import type { LucideIcon } from 'lucide-react';
import { CircleCheck, CircleX, ClipboardCheck, FilePlus2, FileUp, Lock, PackageCheck, PlayCircle, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { Link } from 'react-router';
import { AUDIT_LABEL } from '@/lib/labels';
import { cn, formatDate, relativeTime } from '@/lib/utils';
import type { AuditAction, AuditEvent } from '@/types';
import { EmptyState } from './common';

const ICON: Record<AuditAction, [LucideIcon, string]> = {
  document_created: [FilePlus2, 'bg-slate-100 text-slate-500'],
  file_uploaded: [FileUp, 'bg-navy-50 text-navy-600'],
  new_version_uploaded: [FileUp, 'bg-navy-50 text-navy-600'],
  validation_started: [PlayCircle, 'bg-navy-50 text-navy-600'],
  validation_completed: [CircleCheck, 'bg-navy-50 text-navy-600'],
  manual_testing_saved: [ClipboardCheck, 'bg-slate-100 text-slate-500'],
  manual_testing_completed: [ClipboardCheck, 'bg-ok-soft text-ok'],
  submitted_for_approval: [Send, 'bg-accent-soft text-accent'],
  approved: [ShieldCheck, 'bg-ok-soft text-ok'],
  changes_requested: [Undo2, 'bg-warn-soft text-warn'],
  moved_to_vendor_ready: [PackageCheck, 'bg-ok-soft text-ok'],
  vendor_submitted: [Send, 'bg-navy-900 text-white'],
  access_denied: [Lock, 'bg-fail-soft text-fail'],
};

/** Low-signal events hidden from dashboard feeds (still shown in full audit history). */
const ROUTINE: AuditAction[] = ['document_created', 'validation_started', 'manual_testing_saved', 'moved_to_vendor_ready'];
export const keyEvents = (events: AuditEvent[] | undefined, max = 6) => (events ?? []).filter((e) => !ROUTINE.includes(e.action)).slice(0, max);

export function AuditTimeline({ events, showDocument, compact, emptyText = 'No activity recorded yet.' }: { events: AuditEvent[]; showDocument?: boolean; compact?: boolean; emptyText?: string }) {
  if (!events.length) return <EmptyState title="No activity" description={emptyText} />;
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const [Icon, tone] = ICON[e.action] ?? [CircleX, 'bg-slate-100 text-slate-500'];
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-slate-200" aria-hidden />}
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-slate-800">
                  {AUDIT_LABEL[e.action]}
                  {showDocument && e.docNumber && (
                    <>
                      {' · '}
                      <Link to={`/documents/${e.documentId}`} className="font-mono text-xs text-navy-600 hover:underline">
                        {e.docNumber}
                      </Link>
                    </>
                  )}
                </p>
                <time className="text-[11px] text-slate-400" dateTime={e.at} title={formatDate(e.at, true)}>
                  {relativeTime(e.at)}
                </time>
              </div>
              {!compact && <p className="mt-0.5 break-words text-xs text-slate-500">{e.detail}</p>}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {e.actorName} · {e.actorRole === 'manager' ? 'Manager' : 'Engineer'}
                {e.versionNo ? ` · v${e.versionNo}` : ''}
                {e.outcome === 'denied' && <span className="ml-1 font-medium text-fail">· denied</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

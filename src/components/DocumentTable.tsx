import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileSpreadsheet, Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDocuments, useProjects, useSession, useUsers } from '@/hooks/queries';
import { DOC_TYPE_LABEL, STAGE_LABEL } from '@/lib/labels';
import { cn, formatDate } from '@/lib/utils';
import { STAGE_GROUPS } from '@/features/workflow/stageGroups';
import type { DocumentFilters, DocumentSummary, DocumentType, StageGroup, WorkflowStage } from '@/types';
import { EmptyState, ErrorState, LoadingBlock } from './common';
import { ManualBadge, StageBadge, ValidationBadge } from './StatusBadge';
import { Button } from './ui/button';
import { Card, Input, Select, Table, Td, Th } from './ui/primitives';

type SortKey = NonNullable<DocumentFilters['sort']>;

export function defaultDocLink(d: DocumentSummary, role?: string) {
  if (role === 'manager' && d.stage === 'pending_approval') return `/review/${d.id}`;
  if (role === 'manager' && d.stage === 'vendor_ready') return `/vendor/${d.id}`;
  return `/documents/${d.id}`;
}

export function DocumentTable({
  rows,
  showOwner,
  sort,
  dir,
  onSort,
  compact,
  linkFor,
}: {
  rows: DocumentSummary[];
  showOwner?: boolean;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  onSort?: (k: SortKey) => void;
  compact?: boolean;
  linkFor?: (d: DocumentSummary) => string;
}) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const link = linkFor ?? ((d: DocumentSummary) => defaultDocLink(d, session?.user.role));
  const SortTh = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <Th className={className} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button type="button" onClick={() => onSort(k)} className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-slate-800">
          {children}
          {sort === k ? dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
        </button>
      ) : (
        children
      )}
    </Th>
  );
  return (
    <Table>
      <thead>
        <tr>
          <SortTh k="docNumber">Document</SortTh>
          <SortTh k="projectCode" className={cn('hidden md:table-cell', compact && 'md:hidden 2xl:table-cell')}>
            Project
          </SortTh>
          {showOwner && <Th className="hidden lg:table-cell">Engineer</Th>}
          <SortTh k="updatedAt" className={cn('hidden sm:table-cell', compact && 'sm:hidden')}>
            Updated
          </SortTh>
          <Th>Validation</Th>
          {!compact && <Th className="hidden xl:table-cell">Manual testing</Th>}
          <SortTh k="stage">Workflow stage</SortTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} className="cursor-pointer hover:bg-slate-50/80" onClick={() => navigate(link(d))}>
            <Td className="max-w-[22rem]">
              <Link to={link(d)} className="block min-w-0" onClick={(e) => e.stopPropagation()}>
                <span className="block truncate font-medium text-slate-900 hover:text-navy-700">{d.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                  <span className="font-mono">{d.docNumber}</span>
                  <span>·</span>
                  <span>{d.revision}</span>
                  <span className="hidden sm:inline">· {compact ? `${d.projectCode} · ${d.assetTag}` : DOC_TYPE_LABEL[d.type]}</span>
                </span>
              </Link>
            </Td>
            <Td className={cn('hidden md:table-cell', compact && 'md:hidden 2xl:table-cell')}>
              <span className="block whitespace-nowrap text-xs font-medium text-slate-700">{d.projectCode}</span>
              <span className="block text-[11px] text-slate-500">{d.assetTag}</span>
            </Td>
            {showOwner && <Td className="hidden whitespace-nowrap text-xs lg:table-cell">{d.ownerName}</Td>}
            <Td className={cn('hidden whitespace-nowrap text-xs text-slate-500 sm:table-cell', compact && 'sm:hidden')}>{formatDate(d.updatedAt)}</Td>
            <Td>
              <ValidationBadge status={d.validationStatus} />
              {d.failingRows ? <span className="mt-0.5 block text-[10px] text-fail">{d.failingRows} failing row{d.failingRows > 1 ? 's' : ''}</span> : null}
            </Td>
            {!compact && (
              <Td className="hidden xl:table-cell">
                <ManualBadge status={d.manualTestStatus} />
              </Td>
            )}
            <Td>
              <StageBadge stage={d.stage} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const PAGE_SIZE = 10;

/** Stateful document list with search, filters, sorting and pagination synced to the URL. */
export function DocumentBrowser({ fixed = {}, showOwner, hideFilters = [], linkFor, defaultSort }: { fixed?: DocumentFilters; showOwner?: boolean; hideFilters?: ('project' | 'engineer' | 'type' | 'stage' | 'date')[]; linkFor?: (d: DocumentSummary) => string; defaultSort?: { sort: SortKey; dir: 'asc' | 'desc' } }) {
  const [params, setParams] = useSearchParams();
  const { data: projects } = useProjects();
  const { data: users } = useUsers();

  const filters: DocumentFilters = useMemo(
    () => ({
      q: params.get('q') ?? undefined,
      projectId: params.get('project') ?? undefined,
      ownerId: params.get('engineer') ?? undefined,
      type: (params.get('type') as DocumentType) ?? undefined,
      stage: (params.get('stage') as WorkflowStage) ?? undefined,
      stageGroup: (params.get('group') as StageGroup) ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      sort: (params.get('sort') as SortKey) ?? defaultSort?.sort ?? 'updatedAt',
      dir: (params.get('dir') as 'asc' | 'desc') ?? defaultSort?.dir ?? 'desc',
      page: Number(params.get('page') ?? 1),
      pageSize: PAGE_SIZE,
      ...fixed,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, JSON.stringify(fixed), defaultSort?.sort, defaultSort?.dir],
  );
  const { data, isLoading, isError, error, refetch, isFetching } = useDocuments(filters);

  const set = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const onSort = (k: SortKey) => {
    const next = new URLSearchParams(params);
    const same = (params.get('sort') ?? 'updatedAt') === k;
    next.set('sort', k);
    next.set('dir', same && (params.get('dir') ?? 'desc') === 'desc' ? 'asc' : 'desc');
    setParams(next, { replace: true });
  };
  const activeGroup = params.get('group') as StageGroup | null;
  const hasFilters = ['q', 'project', 'engineer', 'type', 'stage', 'group', 'from', 'to'].some((k) => params.get(k));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const engineers = users?.filter((u) => u.role === 'engineer') ?? [];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              aria-label="Search documents"
              placeholder="Search by number, title, project, asset tag or engineer…"
              className="pl-9"
              defaultValue={filters.q}
              maxLength={100}
              onChange={(e) => set('q', e.target.value.trim() || undefined)}
            />
          </div>
          {!hideFilters.includes('project') && (
            <Select aria-label="Project" className="w-auto min-w-40" value={filters.projectId ?? ''} onChange={(e) => set('project', e.target.value || undefined)}>
              <option value="">All projects</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          )}
          {showOwner && !hideFilters.includes('engineer') && (
            <Select aria-label="Engineer" className="w-auto min-w-36" value={filters.ownerId ?? ''} onChange={(e) => set('engineer', e.target.value || undefined)}>
              <option value="">All engineers</option>
              {engineers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          {!hideFilters.includes('type') && (
            <Select aria-label="Document type" className="w-auto min-w-40" value={filters.type ?? ''} onChange={(e) => set('type', e.target.value || undefined)}>
              <option value="">All document types</option>
              {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
          {!hideFilters.includes('stage') && (
            <Select aria-label="Workflow stage" className="w-auto min-w-40" value={(filters.stage as string) ?? ''} onChange={(e) => set('stage', e.target.value || undefined)}>
              <option value="">All stages</option>
              {Object.entries(STAGE_LABEL)
                .filter(([k]) => k !== 'draft' && k !== 'approved')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          )}
        </div>
        {!hideFilters.includes('date') && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Updated</span>
            <Input type="date" aria-label="Updated from" className="h-8 w-auto text-xs" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value || undefined)} />
            <span>to</span>
            <Input type="date" aria-label="Updated to" className="h-8 w-auto text-xs" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value || undefined)} />
            {activeGroup && STAGE_GROUPS[activeGroup] && (
              <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 font-medium text-navy-700">
                {STAGE_GROUPS[activeGroup].label}
                <button type="button" aria-label="Clear status filter" onClick={() => set('group', undefined)} className="cursor-pointer rounded-full hover:text-navy-900">
                  <X className="size-3" />
                </button>
              </span>
            )}
            {hasFilters && (
              <Button variant="link" size="sm" className="text-xs" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear all filters
              </Button>
            )}
            <span className="ml-auto">{data ? `${data.total} document${data.total === 1 ? '' : 's'}` : ''}</span>
          </div>
        )}
      </div>
      <div className={cn('transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        {isLoading ? (
          <LoadingBlock rows={6} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} className="m-4" />
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="No documents match" description={hasFilters ? 'Try adjusting or clearing the filters.' : 'Documents will appear here once uploaded.'} />
        ) : (
          data && <DocumentTable rows={data.items} showOwner={showOwner} sort={filters.sort} dir={filters.dir} onSort={onSort} linkFor={linkFor} />
        )}
      </div>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-slate-500">
          <span>
            Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2">
              Page {data.page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={data.page >= totalPages} onClick={() => set('page', String(data.page + 1))} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

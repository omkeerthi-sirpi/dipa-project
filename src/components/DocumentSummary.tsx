import { CircleCheck, CircleDashed, CircleMinus, CircleX, MessageSquareText, Paperclip, Send, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { Link } from 'react-router';
import { useProjects, useReports, useRequirements, useUsers } from '@/hooks/queries';
import { DOC_TYPE_LABEL } from '@/lib/labels';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import type { EngDocument, ManualTestSession } from '@/types';
import { EmptyState, KeyValue } from './common';
import { ApprovalBadge, Badge, ManualBadge, StageBadge, ValidationBadge, VendorBadge } from './StatusBadge';
import { Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from './ui/primitives';
import { OverallBadge } from '@/features/validation/ValidationSummary';

export function useDocContext(doc: EngDocument | undefined) {
  const { data: projects } = useProjects();
  const { data: requirements } = useRequirements();
  const { data: users } = useUsers();
  const project = projects?.find((p) => p.id === doc?.projectId);
  return {
    project,
    asset: project?.assets.find((a) => a.id === doc?.assetId),
    requirement: requirements?.find((r) => r.id === doc?.requirementId),
    owner: users?.find((u) => u.id === doc?.ownerId),
    userName: (id: string) => users?.find((u) => u.id === id)?.name ?? id,
    version: doc?.versions.find((v) => v.versionNo === doc.currentVersion),
  };
}

export function DocumentSummaryCard({ doc, title = 'Document details' }: { doc: EngDocument; title?: string }) {
  const { project, asset, requirement, owner, version } = useDocContext(doc);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <StageBadge stage={doc.stage} />
      </CardHeader>
      <CardContent className="space-y-5">
        <KeyValue
          items={[
            { label: 'Document number', value: <span className="font-mono">{doc.docNumber}</span> },
            { label: 'Revision', value: `${version?.revision} (version ${doc.currentVersion} of ${doc.versions.length})` },
            { label: 'Project', value: project ? `${project.code} — ${project.name}` : '—' },
            { label: 'Asset', value: asset ? `${asset.tag} · ${asset.name}` : '—' },
            { label: 'Document type', value: DOC_TYPE_LABEL[doc.type] },
            { label: 'Requirement', value: requirement ? `${requirement.code} ${requirement.version} — ${requirement.title}` : '—' },
            { label: 'Discipline Engineer', value: owner ? `${owner.name} · ${owner.title}` : '—' },
            { label: 'Workbook', value: version ? `${version.file.fileName} · ${formatBytes(version.file.fileSize)}${version.file.synthetic ? ' · synthetic' : ''}` : '—' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          {[
            ['Validation', <ValidationBadge status={doc.validationStatus} />],
            ['Manual testing', <ManualBadge status={doc.manualTestStatus} />],
            ['Approval', <ApprovalBadge status={doc.approvalStatus} />],
            ['Vendor', <VendorBadge status={doc.vendorStatus} />],
          ].map(([l, b]) => (
            <div key={l as string}>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{l}</p>
              {b}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const RESULT_ICON = {
  pass: <CircleCheck className="size-4 text-ok" aria-label="Pass" />,
  fail: <CircleX className="size-4 text-fail" aria-label="Fail" />,
  na: <CircleMinus className="size-4 text-slate-400" aria-label="Not applicable" />,
};

export function ManualTestSummary({ session }: { session?: ManualTestSession }) {
  if (!session) return <EmptyState icon={CircleDashed} title="No manual testing recorded" description="Manual testing for this version has not started." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
        <ManualBadge status={session.status} />
        <span>Tester: <strong className="text-slate-700">{session.testerName || '—'}</strong></span>
        <span>Test date: <strong className="text-slate-700">{formatDate(session.testDate)}</strong></span>
        {session.completedAt && <span>Completed {formatDate(session.completedAt, true)}</span>}
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-border">
        {session.items.map((i) => (
          <li key={i.id} className="flex gap-3 px-4 py-2.5">
            <span className="mt-0.5">{i.result ? RESULT_ICON[i.result] : <CircleDashed className="size-4 text-slate-300" aria-label="Not answered" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800">
                <span className="mr-1.5 font-mono text-[11px] text-slate-400">{i.id}</span>
                {i.title}
                {!i.required && <span className="ml-1.5 text-[11px] text-slate-400">(optional)</span>}
              </p>
              {i.comment && <p className="mt-0.5 text-xs text-slate-500">“{i.comment}”</p>}
            </div>
          </li>
        ))}
      </ul>
      {session.observations && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <MessageSquareText className="mr-1.5 inline size-4 text-slate-400" />
          {session.observations}
        </p>
      )}
      {session.deviation?.acknowledged && (
        <div className="rounded-lg border border-[#f6d999] bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="size-4" /> Deviation requested for unresolved major findings
          </p>
          <p className="mt-1 text-slate-700">{session.deviation.justification}</p>
        </div>
      )}
      {session.evidence.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {session.evidence.map((e) => (
            <span key={e.name} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-xs text-slate-600">
              <Paperclip className="size-3.5 text-slate-400" /> {e.name} <span className="text-slate-400">{formatBytes(e.size)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function VersionHistory({ doc }: { doc: EngDocument }) {
  const { userName } = useDocContext(doc);
  const reports = useReports(doc.id);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Version</Th>
          <Th>File</Th>
          <Th>Uploaded</Th>
          <Th>Change note</Th>
          <Th>Validation runs</Th>
          <Th>Decision</Th>
        </tr>
      </thead>
      <tbody>
        {[...doc.versions].reverse().map((v) => {
          const decision = [...doc.approvals].reverse().find((a) => a.versionNo === v.versionNo);
          return (
            <tr key={v.versionNo} className={cn(v.versionNo === doc.currentVersion && 'bg-navy-50/40')}>
              <Td className="whitespace-nowrap">
                <span className="font-medium text-slate-800">{v.revision}</span>
                <span className="block text-[11px] text-slate-400">v{v.versionNo}{v.versionNo === doc.currentVersion && ' · current'}</span>
              </Td>
              <Td className="text-xs">
                {v.file.fileName}
                <span className="block text-[11px] text-slate-400">
                  {v.file.sheets.length} sheets · {formatBytes(v.file.fileSize)}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-xs">
                {formatDate(v.uploadedAt, true)}
                <span className="block text-[11px] text-slate-400">{userName(v.uploadedBy)}</span>
              </Td>
              <Td className="max-w-64 text-xs text-slate-600">{v.changeNote || '—'}</Td>
              <Td>
                <div className="flex flex-col gap-1">
                  {v.reportIds.length === 0 && <span className="text-xs text-slate-400">None</span>}
                  {v.reportIds.map((id) => {
                    const r = reports.data?.find((x) => x.id === id);
                    return (
                      <Link key={id} to={`/reports/${id}`} className="flex items-center gap-1.5 text-xs text-navy-600 hover:underline">
                        {r ? <OverallBadge overall={r.overall} /> : id}
                        {r && <span className="text-[11px] text-slate-400">{formatDate(r.runAt)}</span>}
                      </Link>
                    );
                  })}
                </div>
              </Td>
              <Td>{decision ? <ApprovalBadge status={decision.decision === 'approved' ? 'approved' : 'changes_requested'} /> : <span className="text-xs text-slate-400">—</span>}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** Submissions, approvals, rejections and vendor transmittals in chronological order. */
export function ApprovalHistory({ doc }: { doc: EngDocument }) {
  const { userName } = useDocContext(doc);
  const items = [
    ...doc.submissions.map((s) => ({ at: s.submittedAt, kind: 'submitted' as const, revision: s.revision, who: userName(s.submittedBy), comment: s.comment, deviation: s.deviationRequested })),
    ...doc.approvals.map((a) => ({ at: a.decidedAt, kind: a.decision, revision: a.revision, who: a.reviewerName, comment: a.comment, deviation: false })),
    ...doc.vendorSubmissions.map((v) => ({ at: v.submittedAt, kind: 'vendor' as const, revision: v.revision, who: userName(v.submittedBy), comment: `${v.transmittalNo} → ${v.vendorName} (${v.contactName})`, deviation: false })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return <EmptyState icon={Send} title="No approval history" description="This document has not been submitted for approval yet." />;
  const meta = {
    submitted: { icon: Send, label: 'Submitted for approval', tone: 'bg-accent-soft text-accent' },
    approved: { icon: ShieldCheck, label: 'Approved', tone: 'bg-ok-soft text-ok' },
    changes_requested: { icon: Undo2, label: 'Changes requested', tone: 'bg-warn-soft text-warn' },
    vendor: { icon: Send, label: 'Submitted to vendor', tone: 'bg-navy-900 text-white' },
  };
  return (
    <ol className="space-y-4">
      {items.map((i, k) => {
        const m = meta[i.kind];
        return (
          <li key={k} className="flex gap-3">
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', m.tone)}>
              <m.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">
                  {m.label} · <span className="font-normal text-slate-500">{i.revision}</span>
                </p>
                <time className="text-[11px] text-slate-400">{formatDate(i.at, true)}</time>
              </div>
              <p className="text-[11px] text-slate-500">{i.who}</p>
              {i.comment && <p className="mt-2 text-sm text-slate-700">{i.comment}</p>}
              {i.deviation && <Badge tone="warn" icon={TriangleAlert} className="mt-2">Deviation requested</Badge>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, ClipboardCheck, Eye, FileSearch, GitBranch, History, MessageSquareText, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ApprovalHistory, DocumentSummaryCard, ManualTestSummary, useDocContext, VersionHistory } from '@/components/DocumentSummary';
import { ErrorState, LoadingBlock, PageHeader, PageLoading } from '@/components/common';
import { Badge, StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu';
import { Card, CardContent, CardHeader, CardTitle, Checkbox, FieldError, Label, Textarea } from '@/components/ui/primitives';
import { WorkflowStepper } from '@/components/WorkflowStepper';
import { FindingsTable } from '@/features/validation/FindingsTable';
import { ValidationSummary } from '@/features/validation/ValidationSummary';
import { can } from '@/features/workflow/workflow';
import { useAudit, useDecision, useDocument, useReport, useSession } from '@/hooks/queries';
import { cn, formatDate } from '@/lib/utils';
import { approveSchema, rejectSchema } from '@/schemas';
import { errorMessage } from '@/services/apiError';
import type { EngDocument, ValidationReport } from '@/types';
import type { z } from 'zod';

export function ReviewPage() {
  const { id } = useParams();
  const doc = useDocument(id);
  const report = useReport(doc.data?.latestReportId);
  if (doc.isLoading || (doc.data?.latestReportId && report.isLoading)) return <PageLoading />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  if (report.isError) return <ErrorState error={report.error} />;
  return <Review doc={doc.data!} report={report.data ?? null} />;
}

function Review({ doc, report }: { doc: EngDocument; report: ValidationReport | null }) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const audit = useAudit({ documentId: doc.id, limit: 100 });
  const { owner, requirement, version } = useDocContext(doc);
  const [viewed, setViewed] = useState<Set<string>>(new Set(['overview']));
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const submission = doc.submissions.at(-1);
  const session_ = doc.manualTests[doc.currentVersion];
  const pending = doc.stage === 'pending_approval';
  const allowed = can(session?.user, 'document.approve', doc);
  const inspected = viewed.has('report') && viewed.has('manual');

  return (
    <>
      <PageHeader
        title={`Review: ${doc.title}`}
        badge={<StageBadge stage={doc.stage} />}
        description={
          <>
            <span className="font-mono">{doc.docNumber}</span> · {version?.revision} · submitted by {owner?.name} {submission && `on ${formatDate(submission.submittedAt, true)}`}
          </>
        }
        crumbs={[{ label: 'Approval Queue', to: '/approvals' }, { label: doc.docNumber }]}
        actions={
          pending && allowed ? (
            <>
              <Button variant="outline" className="border-[#f6d999] text-warn hover:bg-warn-soft" onClick={() => setDialog('reject')}>
                <Undo2 /> Request changes
              </Button>
              <Button variant="success" disabled={!inspected} onClick={() => setDialog('approve')} title={inspected ? undefined : 'Open the Validation report and Manual testing tabs first'}>
                <ShieldCheck /> Approve
              </Button>
            </>
          ) : undefined
        }
      />

      {!pending && (
        <div className="mb-6 rounded-lg border border-border bg-white p-4 text-sm text-slate-600">
          This document is not awaiting approval (current stage: <StageBadge stage={doc.stage} />).{' '}
          {doc.stage === 'vendor_ready' && (
            <Link to={`/vendor/${doc.id}`} className="font-medium text-navy-600 hover:underline">
              Continue to vendor handover →
            </Link>
          )}
        </div>
      )}

      {pending && (
        <div className={cn('mb-6 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm', inspected ? 'border-[#bfe5cc] bg-ok-soft text-ok' : 'border-navy-100 bg-navy-50 text-navy-700')}>
          {inspected ? <CircleCheck className="size-4" /> : <Eye className="size-4" />}
          {inspected ? 'Validation report and manual testing record reviewed — you can now record a decision.' : 'Approval is enabled after you open the Validation report and Manual testing tabs. Automated validation results never approve a document on their own.'}
          <span className="ml-auto flex gap-2 text-xs">
            <Badge tone={viewed.has('report') ? 'ok' : 'neutral'}>Report {viewed.has('report') ? 'reviewed' : 'not opened'}</Badge>
            <Badge tone={viewed.has('manual') ? 'ok' : 'neutral'}>Manual tests {viewed.has('manual') ? 'reviewed' : 'not opened'}</Badge>
          </span>
        </div>
      )}

      {submission?.deviationRequested && submission.versionNo === doc.currentVersion && (
        <div className="mb-6 flex gap-3 rounded-lg border border-[#f6d999] bg-warn-soft p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <p className="font-semibold text-warn">Deviation requested — {report?.totals.failedChecks} unresolved major finding(s)</p>
            <p className="mt-1 text-slate-700">“{session_?.deviation?.justification}”</p>
            <p className="mt-1 text-xs text-slate-500">Approving accepts this deviation on record for {version?.revision}.</p>
          </div>
        </div>
      )}

      <Card className="mb-6 px-4 py-5">
        <WorkflowStepper stage={doc.stage} />
      </Card>

      <Tabs defaultValue="overview" onValueChange={(v) => setViewed((s) => new Set(s).add(v))}>
        <TabsList>
          <TabsTrigger value="overview">
            <MessageSquareText /> Overview
          </TabsTrigger>
          <TabsTrigger value="report">
            <FileSearch /> Validation report {viewed.has('report') && <CircleCheck className="text-ok" />}
          </TabsTrigger>
          <TabsTrigger value="manual">
            <ClipboardCheck /> Manual testing {viewed.has('manual') && <CircleCheck className="text-ok" />}
          </TabsTrigger>
          <TabsTrigger value="history">
            <GitBranch /> Revision &amp; approval history
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History /> Audit
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <DocumentSummaryCard doc={doc} />
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Discipline engineer comments</CardTitle>
                </CardHeader>
                <CardContent>
                  {submission?.comment ? <p className="text-sm text-slate-700">“{submission.comment}”</p> : <p className="text-sm text-slate-400">No comments provided.</p>}
                  <p className="mt-2 text-[11px] text-slate-400">
                    {owner?.name} · {owner?.title}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Automated validation summary</CardTitle>
                  <span className="text-xs text-slate-500">
                    {requirement?.code} {requirement?.version}
                  </span>
                </CardHeader>
                <CardContent>{report ? <ValidationSummary report={report} compact /> : <p className="text-sm text-slate-500">No report.</p>}</CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="report">
          {report ? (
            <Card>
              <CardHeader>
                <CardTitle>Detailed validation report</CardTitle>
                <Button variant="link" size="sm" asChild>
                  <Link to={`/reports/${report.id}`}>Open full page</Link>
                </Button>
              </CardHeader>
              <CardContent className="border-b border-border">
                <ValidationSummary report={report} />
              </CardContent>
              <FindingsTable report={report} />
            </Card>
          ) : (
            <LoadingBlock />
          )}
        </TabsContent>
        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual testing checklist and results</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualTestSummary session={session_} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revision history</CardTitle>
              </CardHeader>
              <VersionHistory doc={doc} />
            </Card>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Previous approvals &amp; comments</h3>
              <ApprovalHistory doc={doc} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <Card>
            <CardContent>{audit.isLoading ? <LoadingBlock rows={4} className="p-0" /> : <AuditTimeline events={audit.data ?? []} />}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ApproveDialog open={dialog === 'approve'} onClose={() => setDialog(null)} doc={doc} deviation={!!submission?.deviationRequested} onDone={() => navigate(`/vendor/${doc.id}`)} />
      <RejectDialog open={dialog === 'reject'} onClose={() => setDialog(null)} doc={doc} onDone={() => navigate('/approvals')} />
    </>
  );
}

function ApproveDialog({ open, onClose, doc, deviation, onDone }: { open: boolean; onClose: () => void; doc: EngDocument; deviation: boolean; onDone: () => void }) {
  const decide = useDecision();
  const { data: session } = useSession();
  const version = doc.versions.find((v) => v.versionNo === doc.currentVersion)!;
  const form = useForm<z.input<typeof approveSchema>>({ resolver: zodResolver(approveSchema), defaultValues: { comment: '', confirm: false as unknown as true } });
  const [acceptDeviation, setAcceptDeviation] = useState(false);
  const submit = form.handleSubmit((v) =>
    decide.mutate(
      { id: doc.id, decision: 'approved', comment: v.comment ?? '', versionNo: doc.currentVersion },
      {
        onSuccess: () => {
          toast.success(`${doc.docNumber} ${version.revision} approved`, { description: 'Moved to the vendor submission stage.' });
          onClose();
          onDone();
        },
        onError: (e) => toast.error('Approval failed', { description: errorMessage(e) }),
      },
    ),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Approve document</DialogTitle>
            <DialogDescription>
              Approve <strong>{doc.docNumber}</strong> {version.revision} (version {doc.currentVersion}). This decision is recorded against this exact version.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs">
              <span className="text-slate-500">Reviewer</span>
              <span className="font-medium text-slate-800">{session?.user.name}</span>
              <span className="text-slate-500">Date</span>
              <span className="font-medium text-slate-800">{formatDate(new Date().toISOString(), true)}</span>
              <span className="text-slate-500">Version</span>
              <span className="font-medium text-slate-800">
                {version.revision} · v{doc.currentVersion}
              </span>
            </div>
            <div>
              <Label htmlFor="approveComment">Approval comments (optional)</Label>
              <Textarea id="approveComment" rows={3} {...form.register('comment')} />
              <FieldError message={form.formState.errors.comment?.message} />
            </div>
            {deviation && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-warn-soft p-3 text-sm text-warn">
                <Checkbox className="mt-0.5" checked={acceptDeviation} onChange={(e) => setAcceptDeviation(e.target.checked)} />I accept the requested deviation for unresolved major findings.
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <Checkbox className="mt-0.5" {...form.register('confirm')} />I have reviewed the validation report and manual testing record for this version.
            </label>
            <FieldError message={form.formState.errors.confirm?.message} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={decide.isPending} disabled={deviation && !acceptDeviation}>
              <ShieldCheck /> Confirm approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onClose, doc, onDone }: { open: boolean; onClose: () => void; doc: EngDocument; onDone: () => void }) {
  const decide = useDecision();
  const version = doc.versions.find((v) => v.versionNo === doc.currentVersion)!;
  const form = useForm<z.input<typeof rejectSchema>>({ resolver: zodResolver(rejectSchema), defaultValues: { comment: '' } });
  const submit = form.handleSubmit((v) =>
    decide.mutate(
      { id: doc.id, decision: 'changes_requested', comment: v.comment, versionNo: doc.currentVersion },
      {
        onSuccess: () => {
          toast.success('Changes requested', { description: 'The document has been returned to the engineer.' });
          onClose();
          onDone();
        },
        onError: (e) => toast.error('Could not record decision', { description: errorMessage(e) }),
      },
    ),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Return {doc.docNumber} {version.revision} to the engineer. Previous reports and comments are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="rejectComment">Reason / review comments (required)</Label>
            <Textarea id="rejectComment" rows={5} placeholder="Describe what must be corrected before resubmission…" aria-invalid={!!form.formState.errors.comment} {...form.register('comment')} />
            <FieldError message={form.formState.errors.comment?.message} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={decide.isPending}>
              <Undo2 /> Return to engineer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

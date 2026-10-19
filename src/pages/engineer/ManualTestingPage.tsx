import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CircleCheck, CircleMinus, CircleX, ClipboardCheck, FileSearch, FileUp, Lock, Paperclip, Save, Send, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ManualTestSummary } from '@/components/DocumentSummary';
import { ErrorState, PageHeader, PageLoading } from '@/components/common';
import { ManualBadge, StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, FieldError, Input, Label, Textarea } from '@/components/ui/primitives';
import { ValidationSummary } from '@/features/validation/ValidationSummary';
import { manualTestBlockers, submissionBlockers } from '@/features/workflow/workflow';
import { useDocument, useReport, useSaveManualTest, useSession, useSubmitForApproval } from '@/hooks/queries';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import { manualTestSchema, type ManualTestValues } from '@/schemas';
import { errorMessage, isApiError } from '@/services/apiError';
import { manualTestTemplate } from '@/mocks/data/reference';
import type { EngDocument, ManualResult, ManualTestSession, ValidationReport } from '@/types';

export function ManualTestingPage() {
  const { id } = useParams();
  const doc = useDocument(id);
  const report = useReport(doc.data?.latestReportId);
  if (doc.isLoading || (doc.data?.latestReportId && report.isLoading)) return <PageLoading />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  return <ManualTesting doc={doc.data!} report={report.data ?? null} key={`${doc.data!.id}-${doc.data!.currentVersion}`} />;
}

function ManualTesting({ doc, report }: { doc: EngDocument; report: ValidationReport | null }) {
  const navigate = useNavigate();
  const { data: auth } = useSession();
  const save = useSaveManualTest();
  const submit = useSubmitForApproval();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitComment, setSubmitComment] = useState('');
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [evidence, setEvidence] = useState(doc.manualTests[doc.currentVersion]?.evidence ?? []);
  const version = doc.versions.find((v) => v.versionNo === doc.currentVersion)!;
  const existing: ManualTestSession | undefined = doc.manualTests[doc.currentVersion];
  const blockers = manualTestBlockers(doc, report);
  const readOnly = ['pending_approval', 'approved', 'vendor_ready', 'vendor_submitted'].includes(doc.stage);
  const needsDeviation = !!report && report.totals.failedChecks > 0 && report.totals.criticalFailures === 0;

  const form = useForm<ManualTestValues>({
    resolver: zodResolver(manualTestSchema),
    defaultValues: {
      testerName: existing?.testerName || auth?.user.name || '',
      testDate: existing?.testDate ?? new Date().toISOString().slice(0, 10),
      items: manualTestTemplate.map((t) => {
        const e = existing?.items.find((i) => i.id === t.id);
        return { id: t.id, required: t.required, result: e?.result ?? null, comment: e?.comment ?? '' };
      }),
      observations: existing?.observations ?? '',
      deviationAcknowledged: existing?.deviation?.acknowledged ?? false,
      deviationJustification: existing?.deviation?.justification ?? '',
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'items' });
  const items = useWatch({ control: form.control, name: 'items' });
  const devAck = useWatch({ control: form.control, name: 'deviationAcknowledged' });
  const devText = useWatch({ control: form.control, name: 'deviationJustification' });

  const live = useMemo(() => {
    const answered = items.filter((i) => i.result).length;
    const reqOpen = items.filter((i) => i.required && !i.result).length;
    const failed = items.filter((i) => i.result === 'fail').length;
    return { answered, reqOpen, failed, status: failed ? 'failed' : reqOpen === 0 ? 'completed' : answered ? 'in_progress' : 'not_started' } as const;
  }, [items]);

  // Live readiness, computed from the saved session (what the server will evaluate).
  const readiness = submissionBlockers(doc, report, existing);

  if (readOnly) {
    return (
      <>
        <Header doc={doc} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-slate-400" /> Manual testing record (read-only)
            </CardTitle>
            <StageBadge stage={doc.stage} />
          </CardHeader>
          <CardContent>
            <ManualTestSummary session={existing} />
          </CardContent>
        </Card>
      </>
    );
  }

  if (blockers.length) {
    return (
      <>
        <Header doc={doc} />
        <Card className="p-6">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-fail" />
            <div>
              <p className="font-semibold text-slate-900">Manual testing is not available yet</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {report && (
                  <Button variant="outline" asChild>
                    <Link to={`/reports/${report.id}`}>
                      <FileSearch /> Review report
                    </Link>
                  </Button>
                )}
                <Button asChild>
                  <Link to={`/upload?documentId=${doc.id}`}>
                    <FileUp /> Upload corrected version
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const toInput = (v: ManualTestValues, complete: boolean) => ({
    testerName: v.testerName,
    testDate: v.testDate,
    items: v.items.map((i) => ({ id: i.id, result: i.result, comment: i.comment })),
    observations: v.observations,
    evidence,
    deviation: needsDeviation ? { acknowledged: v.deviationAcknowledged, justification: v.deviationJustification } : undefined,
    complete,
  });

  const onSave = () =>
    save.mutate(
      { id: doc.id, input: toInput(form.getValues(), false) },
      { onSuccess: () => (form.reset(form.getValues()), toast.success('Progress saved')), onError: (e) => toast.error('Could not save', { description: errorMessage(e) }) },
    );

  const onComplete = form.handleSubmit((v) => {
    if (live.reqOpen) {
      toast.error(`${live.reqOpen} required test(s) still need a result.`);
      return;
    }
    if (needsDeviation && (!v.deviationAcknowledged || v.deviationJustification.trim().length < 20)) {
      form.setError('deviationJustification', { message: 'Acknowledge the unresolved findings and justify the deviation (min. 20 characters).' });
      return;
    }
    save.mutate(
      { id: doc.id, input: toInput(v, true) },
      {
        onSuccess: (d) => {
          form.reset(v);
          return d.manualTestStatus === 'completed' ? toast.success('Manual testing completed', { description: 'The document is ready for Responsible Engineer review.' }) : toast.warning('Manual testing recorded with failures', { description: 'Resolve the failed tests before submission.' });
        },
        onError: (e) => toast.error(errorMessage(e), { description: isApiError(e) ? e.details?.slice(0, 3).join(' · ') : undefined }),
      },
    );
  });

  const onSubmitApproval = () =>
    submit.mutate(
      { id: doc.id, comment: submitComment },
      {
        onSuccess: () => {
          setSubmitOpen(false);
          toast.success('Submitted to Responsible Engineer', { description: 'Responsible Engineers on this project have been notified.' });
          navigate('/tracking');
        },
        onError: (e) => toast.error(errorMessage(e), { description: isApiError(e) ? e.details?.join(' · ') : undefined }),
      },
    );

  return (
    <>
      <Header doc={doc} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Manual verification checklist</CardTitle>
                <CardDescription>
                  {version.revision} · {live.answered}/{items.length} answered
                </CardDescription>
              </div>
              <ManualBadge status={live.status} />
            </CardHeader>
            <ul className="divide-y divide-slate-100">
              {fields.map((f, idx) => {
                const t = manualTestTemplate[idx];
                const value = items[idx]?.result;
                const err = form.formState.errors.items?.[idx]?.comment?.message;
                const comment = items[idx]?.comment ?? '';
                const needsNote = value === 'fail' || (value === 'na' && t.required);
                const showNote = needsNote || !!comment || !!err || openNotes.has(t.id);
                return (
                  <li key={f.id} className={cn('px-5 py-4', value === 'fail' && 'bg-fail-soft/40')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          <span className="mr-2 font-mono text-[11px] text-slate-400">{t.id}</span>
                          {t.title}
                          {t.required ? <span className="ml-1 text-fail" aria-label="required">*</span> : <span className="ml-1.5 text-[11px] font-normal text-slate-400">(optional)</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
                      </div>
                      <ResultToggle value={value} onChange={(r) => form.setValue(`items.${idx}.result`, r, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} label={t.title} />
                    </div>
                    {showNote ? (
                      <>
                        <Textarea rows={1} className="mt-3 min-h-9 text-xs" placeholder={value === 'fail' ? 'Describe the failure (required)…' : needsNote ? 'Justify why this mandatory test is not applicable (required)…' : 'Note (optional)'} aria-invalid={!!err} {...form.register(`items.${idx}.comment`)} />
                        <FieldError message={err} />
                      </>
                    ) : (
                      <button type="button" className="mt-2 cursor-pointer text-xs font-medium text-navy-600 hover:underline" onClick={() => setOpenNotes((p) => new Set(p).add(t.id))}>
                        + Add note
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {needsDeviation && report && (
            <Card className="border-[#f6d999]">
              <CardHeader className="bg-warn-soft/60">
                <div>
                  <CardTitle className="flex items-center gap-2 text-warn">
                    <TriangleAlert className="size-4" /> Deviation request — authorised exception
                  </CardTitle>
                  <CardDescription>
                    {report.totals.failedChecks} major finding(s) remain unresolved. Submission requires a justified deviation that the Responsible Engineer must explicitly accept.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox className="mt-0.5" {...form.register('deviationAcknowledged')} />
                  I acknowledge the unresolved major findings and request a deviation for Responsible Engineer review.
                </label>
                <Textarea rows={3} placeholder="Technical justification (min. 20 characters)…" disabled={!devAck} aria-invalid={!!form.formState.errors.deviationJustification} {...form.register('deviationJustification')} />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <FieldError message={form.formState.errors.deviationJustification?.message} />
                  <span className="ml-auto">{devText.trim().length}/20 min</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Tester &amp; evidence</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <Label htmlFor="testerName">Tester name</Label>
                <Input id="testerName" aria-invalid={!!form.formState.errors.testerName} {...form.register('testerName')} />
                <FieldError message={form.formState.errors.testerName?.message} />
              </div>
              <div>
                <Label htmlFor="testDate">Test date</Label>
                <Input id="testDate" type="date" max={new Date().toISOString().slice(0, 10)} aria-invalid={!!form.formState.errors.testDate} {...form.register('testDate')} />
                <FieldError message={form.formState.errors.testDate?.message} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="observations">Overall observations</Label>
                <Textarea id="observations" rows={3} placeholder="Summary of manual verification, sampling approach, references consulted…" {...form.register('observations')} />
                <FieldError message={form.formState.errors.observations?.message} />
              </div>
              <div className="md:col-span-2">
                <Label className="flex items-center gap-2">
                  Evidence attachments <span className="font-normal text-slate-400">(file names only)</span>
                </Label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 hover:bg-slate-50">
                  <Paperclip className="size-4" /> Attach evidence (PDF, PNG, JPG)
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.png,.jpg,.jpeg"
                    multiple
                    onChange={(e) => {
                      const add = [...(e.target.files ?? [])].filter((f) => /\.(pdf|png|jpe?g)$/i.test(f.name) && f.size <= 20 * 1024 * 1024).map((f) => ({ name: f.name.slice(0, 120), size: f.size }));
                      if (add.length < (e.target.files?.length ?? 0)) toast.error('Only PDF/PNG/JPG files up to 20 MB are accepted.');
                      setEvidence((prev) => [...prev, ...add].slice(0, 5));
                      e.target.value = '';
                    }}
                  />
                </label>
                {evidence.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {evidence.map((e) => (
                      <li key={e.name} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-xs text-slate-600">
                        <Paperclip className="size-3.5 text-slate-400" /> {e.name} <span className="text-slate-400">{formatBytes(e.size)}</span>
                        <button type="button" aria-label={`Remove ${e.name}`} className="cursor-pointer text-slate-400 hover:text-fail" onClick={() => setEvidence((p) => p.filter((x) => x.name !== e.name))}>
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-slate-400">{existing ? `Last saved ${formatDate(existing.updatedAt, true)}` : 'Not saved yet'}</span>
            <Button type="button" variant="outline" onClick={onSave} loading={save.isPending && !save.variables?.input.complete}>
              <Save /> Save progress
            </Button>
            <Button type="button" onClick={onComplete} loading={save.isPending && !!save.variables?.input.complete}>
              <ClipboardCheck /> Complete testing
            </Button>
            <Button type="button" variant="accent" disabled={readiness.length > 0 || form.formState.isDirty} onClick={() => setSubmitOpen(true)} title={form.formState.isDirty ? 'Save or complete testing first' : undefined}>
              <Send /> Submit to Responsible Engineer
            </Button>
          </div>
        </form>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submission readiness</CardTitle>
            </CardHeader>
            <CardContent>
              {readiness.length === 0 ? (
                <p className="flex items-center gap-2 text-sm font-medium text-ok">
                  <CircleCheck className="size-4" /> Ready to submit to Responsible Engineer
                </p>
              ) : (
                <ul className="space-y-2">
                  {readiness.map((r) => (
                    <li key={r} className="flex gap-2 text-xs text-slate-600">
                      <CircleX className="mt-0.5 size-3.5 shrink-0 text-fail" /> {r}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-border pt-3 text-[11px] text-slate-400">The same rules are enforced by the API on submission.</p>
            </CardContent>
          </Card>
          {report && (
            <Card>
              <CardHeader>
                <CardTitle>Automated validation</CardTitle>
                <Button variant="link" size="sm" asChild>
                  <Link to={`/reports/${report.id}`}>Full report</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ValidationSummary report={report} compact />
                {report.findings.filter((f) => f.status === 'failed').length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unresolved failures</p>
                    <ul className="space-y-1.5">
                      {report.findings
                        .filter((f) => f.status === 'failed')
                        .slice(0, 6)
                        .map((f) => (
                          <li key={f.id} className="rounded-md bg-fail-soft px-2.5 py-1.5 text-[11px] text-fail">
                            {f.sheet} r{f.row ?? '—'} · {f.field}: {f.message}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit to Responsible Engineer</DialogTitle>
            <DialogDescription>
              {doc.docNumber} {version.revision} will be locked while it awaits a Responsible Engineer decision. You cannot approve your own document.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Label htmlFor="submitComment">Comments for the reviewer</Label>
            <Textarea id="submitComment" rows={4} maxLength={2000} value={submitComment} onChange={(e) => setSubmitComment(e.target.value)} placeholder="Summarise what was verified, any deviations and context for the reviewer…" />
            {needsDeviation && (
              <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> This submission includes a deviation request for unresolved major findings.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" loading={submit.isPending} onClick={onSubmitApproval}>
              <Send /> Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Header({ doc }: { doc: EngDocument }) {
  const v = doc.versions.find((x) => x.versionNo === doc.currentVersion)!;
  return (
    <PageHeader
      title="Manual testing"
      badge={<StageBadge stage={doc.stage} />}
      description={
        <>
          <Link to={`/documents/${doc.id}`} className="font-mono hover:underline">
            {doc.docNumber}
          </Link>{' '}
          · {doc.title} · {v.revision}
        </>
      }
      crumbs={[{ label: 'Manual Testing', to: '/manual-testing' }, { label: doc.docNumber }]}
    />
  );
}

function ResultToggle({ value, onChange, label }: { value: ManualResult | null | undefined; onChange: (r: ManualResult) => void; label: string }) {
  const opts: { v: ManualResult; l: string; icon: typeof CircleCheck; on: string }[] = [
    { v: 'pass', l: 'Pass', icon: CircleCheck, on: 'bg-ok text-white border-ok' },
    { v: 'fail', l: 'Fail', icon: CircleX, on: 'bg-fail text-white border-fail' },
    { v: 'na', l: 'N/A', icon: CircleMinus, on: 'bg-slate-600 text-white border-slate-600' },
  ];
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300" role="radiogroup" aria-label={`Result for ${label}`}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn('flex cursor-pointer items-center gap-1 border-r border-slate-300 px-2.5 py-1.5 text-xs font-medium last:border-r-0', value === o.v ? o.on : 'bg-white text-slate-600 hover:bg-slate-50')}
        >
          <o.icon className="size-3.5" /> {o.l}
        </button>
      ))}
    </div>
  );
}

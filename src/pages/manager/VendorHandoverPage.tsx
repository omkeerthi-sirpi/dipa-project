import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, FileSearch, Lock, PackageCheck, Send, ShieldCheck } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { DocumentSummaryCard, ManualTestSummary, useDocContext } from '@/components/DocumentSummary';
import { ErrorState, KeyValue, MockTag, PageHeader, PageLoading } from '@/components/common';
import { StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, FieldError, Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { ValidationSummary } from '@/features/validation/ValidationSummary';
import { useDocument, useReport, useVendorSubmit, useVendors } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';
import { vendorSchema, type VendorValues } from '@/schemas';
import { errorMessage } from '@/services/apiError';
import type { EngDocument, ValidationReport } from '@/types';
import type { z } from 'zod';

const PACKAGE = ['Approved document', 'Validation report', 'Manual testing record', 'Approval certificate', 'Requirement document reference'];

export function VendorHandoverPage() {
  const { id } = useParams();
  const doc = useDocument(id);
  const report = useReport(doc.data?.latestReportId);
  if (doc.isLoading || report.isLoading) return <PageLoading />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  return <Handover doc={doc.data!} report={report.data ?? null} />;
}

function Handover({ doc, report }: { doc: EngDocument; report: ValidationReport | null }) {
  const { version, project, asset } = useDocContext(doc);
  const vendors = useVendors();
  const submitM = useVendorSubmit();
  const approval = [...doc.approvals].reverse().find((a) => a.versionNo === doc.currentVersion && a.decision === 'approved');
  const sub = [...doc.vendorSubmissions].reverse().find((v) => v.versionNo === doc.currentVersion);
  const form = useForm<z.input<typeof vendorSchema>, unknown, VendorValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: { vendorId: '', contactName: '', contactEmail: '', notes: '', packageItems: PACKAGE.slice(0, 4), confirm: false as unknown as true },
  });
  const items = useWatch({ control: form.control, name: 'packageItems' });

  const crumbs = [{ label: 'Vendor Submissions', to: '/vendor' }, { label: doc.docNumber }];

  if (doc.stage !== 'vendor_ready' && doc.stage !== 'vendor_submitted') {
    return (
      <>
        <PageHeader title="Vendor handover" crumbs={crumbs} />
        <Card className="p-6 text-sm text-slate-600">
          <p className="flex items-center gap-2">
            <Lock className="size-4 text-slate-400" /> Vendor submission requires explicit manager approval. This document is currently <StageBadge stage={doc.stage} />.
          </p>
        </Card>
      </>
    );
  }

  const onSubmit = form.handleSubmit((v) =>
    submitM.mutate(
      { id: doc.id, input: { versionNo: doc.currentVersion, vendorId: v.vendorId, contactName: v.contactName, contactEmail: v.contactEmail, notes: v.notes, packageItems: v.packageItems } },
      {
        onSuccess: () => toast.success('Submitted to vendor (simulated)', { description: 'Transmittal recorded in the audit timeline.' }),
        onError: (e) => toast.error('Vendor submission failed', { description: errorMessage(e) }),
      },
    ),
  );

  return (
    <>
      <PageHeader
        title={sub ? 'Vendor submission summary' : 'Vendor handover'}
        badge={<StageBadge stage={doc.stage} />}
        description={
          <>
            <span className="font-mono">{doc.docNumber}</span> · {doc.title} · {version?.revision}
          </>
        }
        crumbs={crumbs}
      />

      {sub && (
        <Card className="mb-6 border-[#bfe5cc]">
          <CardHeader className="bg-ok-soft/60">
            <div>
              <CardTitle className="flex items-center gap-2 text-ok">
                <CircleCheck className="size-4" /> Submitted to {sub.vendorName}
              </CardTitle>
              <CardDescription>Transmittal {sub.transmittalNo} · read-only record</CardDescription>
            </div>
            <MockTag>No email sent — simulated</MockTag>
          </CardHeader>
          <CardContent>
            <KeyValue
              items={[
                { label: 'Transmittal', value: <span className="font-mono">{sub.transmittalNo}</span> },
                { label: 'Submission date', value: formatDate(sub.submittedAt, true) },
                { label: 'Vendor', value: sub.vendorName },
                { label: 'Contact', value: `${sub.contactName} · ${sub.contactEmail}` },
                { label: 'Document version', value: `${sub.revision} (v${sub.versionNo})` },
                { label: 'Package', value: sub.packageItems.join(', ') },
                { label: 'Notes', value: sub.notes || '—' },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <div className={sub ? 'grid grid-cols-1 gap-6' : 'grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]'}>
        <div className={sub ? 'grid items-start gap-6 xl:grid-cols-2' : 'space-y-6'}>
          <DocumentSummaryCard doc={doc} title="Approved document" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-ok" /> Manager approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approval ? (
                <KeyValue
                  items={[
                    { label: 'Approved by', value: approval.reviewerName },
                    { label: 'Approved on', value: formatDate(approval.decidedAt, true) },
                    { label: 'Version approved', value: `${approval.revision} (v${approval.versionNo})` },
                    { label: 'Report reference', value: approval.reportId ? <Link className="font-mono text-navy-600 hover:underline" to={`/reports/${approval.reportId}`}>{approval.reportId}</Link> : '—' },
                    { label: 'Comments', value: approval.comment || '—' },
                  ]}
                />
              ) : (
                <p className="text-sm text-fail">No approval found for this version.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Validation report</CardTitle>
              {report && (
                <Button variant="link" size="sm" asChild>
                  <Link to={`/reports/${report.id}`}>
                    <FileSearch /> Open
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>{report ? <ValidationSummary report={report} compact /> : '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Manual testing summary</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualTestSummary session={doc.manualTests[doc.currentVersion]} />
            </CardContent>
          </Card>
        </div>

        {!sub && (
          <Card className="h-fit xl:sticky xl:top-20">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <PackageCheck className="size-4 text-navy-500" /> Submission package
                </CardTitle>
                <CardDescription>
                  {project?.code} · {asset?.tag} · submission date {formatDate(new Date().toISOString())}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div>
                  <Label htmlFor="vendorId">Vendor</Label>
                  <Select
                    id="vendorId"
                    aria-invalid={!!form.formState.errors.vendorId}
                    {...form.register('vendorId', {
                      onChange: (e) => {
                        const v = vendors.data?.find((x) => x.id === e.target.value);
                        if (v) {
                          form.setValue('contactName', v.contactName, { shouldValidate: true });
                          form.setValue('contactEmail', v.contactEmail, { shouldValidate: true });
                        }
                      },
                    })}
                  >
                    <option value="">Select vendor…</option>
                    {vendors.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} — {v.scope}
                      </option>
                    ))}
                  </Select>
                  <FieldError message={form.formState.errors.vendorId?.message} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <Label htmlFor="contactName">Vendor contact</Label>
                    <Input id="contactName" placeholder="Contact name" aria-invalid={!!form.formState.errors.contactName} {...form.register('contactName')} />
                    <FieldError message={form.formState.errors.contactName?.message} />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Contact email</Label>
                    <Input id="contactEmail" type="email" placeholder="name@vendor.example" aria-invalid={!!form.formState.errors.contactEmail} {...form.register('contactEmail')} />
                    <FieldError message={form.formState.errors.contactEmail?.message} />
                  </div>
                </div>
                <fieldset>
                  <legend className="mb-1.5 text-xs font-medium text-slate-700">Package checklist</legend>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {PACKAGE.map((p, i) => (
                      <label key={p} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={items?.includes(p) ?? false}
                          disabled={i === 0}
                          onChange={(e) =>
                            form.setValue('packageItems', e.target.checked ? [...(items ?? []), p] : (items ?? []).filter((x) => x !== p), { shouldValidate: form.formState.isSubmitted })
                          }
                        />
                        {p}
                        {i === 0 && <span className="text-[11px] text-slate-400">(required)</span>}
                      </label>
                    ))}
                  </div>
                  <FieldError message={form.formState.errors.packageItems?.message} />
                </fieldset>
                <div>
                  <Label htmlFor="notes">Transmittal notes</Label>
                  <Textarea id="notes" rows={3} placeholder="Purpose of issue, required response date…" {...form.register('notes')} />
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <Checkbox className="mt-0.5" {...form.register('confirm')} />I confirm this package contains only the approved version and is authorised for release.
                </label>
                <FieldError message={form.formState.errors.confirm?.message} />
                <Button type="submit" variant="accent" className="w-full" loading={submitM.isPending}>
                  <Send /> Submit to vendor
                </Button>
                <p className="text-center text-[11px] text-slate-400">Simulated — no email or external vendor integration.</p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileUp,
  Info,
  LoaderCircle,
  TriangleAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, KeyValue, PageHeader, PageLoading } from '@/components/common';
import { Badge, StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, FieldError, Input, Label, Progress, Select, Table, Td, Textarea, Th } from '@/components/ui/primitives';
import { analyseStructure } from '@/features/validation/engine';
import { downloadSampleWorkbook, parseWorkbookFile, UploadError, type ParseResult } from '@/features/upload/parseWorkbook';
import { NEW_VERSION_STAGES } from '@/features/workflow/workflow';
import { useCreateDocument, useDocument, useProjects, useRequirements, useUploadVersion } from '@/hooks/queries';
import { DOC_TYPE_LABEL } from '@/lib/labels';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import { documentDetailsSchema, type DocumentDetailsValues, newVersionSchema } from '@/schemas';
import { errorMessage } from '@/services/apiError';
import type { DocumentType, EngDocument, RequirementDocument } from '@/types';

const STEPS = ['Project & document type', 'Upload Excel file', 'Requirement document'];

function WizardSteps({ step }: { step: number }) {
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Upload steps">
      {STEPS.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', i === step ? 'border-navy-300 bg-white shadow-sm' : 'border-transparent')} aria-current={i === step ? 'step' : undefined}>
          <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', i < step ? 'bg-navy-600 text-white' : i === step ? 'bg-accent text-white' : 'bg-slate-200 text-slate-500')}>
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn('hidden text-sm sm:block', i === step ? 'font-semibold text-slate-900' : 'text-slate-500')}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function UploadPage() {
  const [params] = useSearchParams();
  const documentId = params.get('documentId') ?? undefined;
  const existing = useDocument(documentId);
  if (documentId && existing.isLoading) return <PageLoading />;
  if (documentId && existing.isError) return <ErrorState error={existing.error} />;
  return <UploadWizard existing={existing.data} />;
}

function UploadWizard({ existing }: { existing?: EngDocument }) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const { data: requirements } = useRequirements();
  const createDoc = useCreateDocument();
  const uploadVersion = useUploadVersion();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [parse, setParse] = useState<{ state: 'idle' | 'reading' | 'done' | 'error'; result?: ParseResult; error?: string }>({ state: 'idle' });
  const [confirmed, setConfirmed] = useState(false);
  const [created, setCreated] = useState<EngDocument | null>(null);
  const isVersion = !!existing;
  const lastVersion = existing?.versions.find((v) => v.versionNo === existing.currentVersion);

  const form = useForm<DocumentDetailsValues>({
    resolver: zodResolver(isVersion ? documentDetailsSchema.extend({ changeNote: newVersionSchema.shape.changeNote }) : documentDetailsSchema),
    defaultValues: existing
      ? { projectId: existing.projectId, assetId: existing.assetId, type: existing.type, title: existing.title, revision: '', changeNote: '' }
      : { projectId: '', assetId: '', type: undefined as unknown as DocumentType, title: '', revision: 'Rev 0', changeNote: '' },
  });
  const values = form.watch();
  const project = projects?.find((p) => p.id === values.projectId);
  const requirement: RequirementDocument | undefined = requirements?.find((r) => r.documentType === values.type);
  const structure = useMemo(() => (requirement && parse.result ? analyseStructure(requirement, parse.result.workbook) : null), [requirement, parse.result]);

  if (existing && !NEW_VERSION_STAGES.includes(existing.stage)) {
    return (
      <>
        <PageHeader title="Upload new version" crumbs={[{ label: 'Documents', to: '/documents' }, { label: existing.docNumber, to: `/documents/${existing.id}` }, { label: 'New version' }]} />
        <Card className="p-6">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <TriangleAlert className="size-4 text-warn" /> A new version cannot be uploaded while the document is <StageBadge stage={existing.stage} />. Approved versions are locked.
          </p>
        </Card>
      </>
    );
  }

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setParse({ state: 'reading' });
    try {
      const [result] = await Promise.all([parseWorkbookFile(f), new Promise((r) => setTimeout(r, 700))]);
      setParse({ state: 'done', result });
    } catch (e) {
      setFile(null);
      setParse({ state: 'error', error: e instanceof UploadError ? e.message : 'The file could not be processed.' });
    }
  };

  const finish = () => {
    if (!parse.result) return;
    const v = form.getValues();
    const onSuccess = (doc: EngDocument) => {
      setCreated(doc);
      toast.success(isVersion ? `Version ${doc.currentVersion} uploaded` : 'Document uploaded', { description: `${doc.docNumber} is ready for validation.` });
    };
    const onError = (e: unknown) => toast.error('Upload failed', { description: errorMessage(e) });
    if (existing) {
      uploadVersion.mutate({ id: existing.id, input: { revision: v.revision, changeNote: v.changeNote, file: parse.result.meta }, file, workbook: parse.result.workbook }, { onSuccess, onError });
    } else {
      createDoc.mutate({ input: { ...v, file: parse.result.meta }, file, workbook: parse.result.workbook }, { onSuccess, onError });
    }
  };

  const crumbs = existing
    ? [{ label: 'My Documents', to: '/documents' }, { label: existing.docNumber, to: `/documents/${existing.id}` }, { label: 'Upload new version' }]
    : [{ label: 'Dashboard', to: '/dashboard' }, { label: 'Upload Document' }];

  if (created) {
    return (
      <>
        <PageHeader title="Upload complete" crumbs={crumbs} />
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
            <CircleCheck className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">{created.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono">{created.docNumber}</span> · {created.versions.at(-1)?.revision} · {created.versions.at(-1)?.file.fileName}
          </p>
          <div className="mt-3 flex justify-center">
            <StageBadge stage={created.stage} />
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm text-slate-600">The workbook is held in browser memory for this session only. Start the guided validation now to check it against {requirement?.code}.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" asChild>
              <Link to={`/documents/${created.id}`}>View document</Link>
            </Button>
            <Button variant="accent" onClick={() => navigate(`/validate/${created.id}`)}>
              <Bot /> Start validation chatbot
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const next0 = form.handleSubmit(() => setStep(1));

  return (
    <>
      <PageHeader
        title={existing ? `Upload new version — ${existing.docNumber}` : 'Upload engineering document'}
        description={existing ? `Current version: v${existing.currentVersion} (${lastVersion?.revision}). Previous reports, comments and approvals are retained.` : 'Register a workbook, preview its structure and associate it with the controlling requirement document.'}
        crumbs={crumbs}
      />
      <WizardSteps step={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Step 1 — Project and document type</CardTitle>
              <CardDescription>Only projects you are a member of are listed.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={next0} noValidate className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {isVersion && existing && (
                <div className="rounded-lg border border-border bg-slate-50 p-4 md:col-span-2">
                  <KeyValue
                    items={[
                      { label: 'Document', value: `${existing.docNumber} — ${existing.title}` },
                      { label: 'Project', value: `${project?.code} — ${project?.name}` },
                      { label: 'Asset', value: project?.assets.find((a) => a.id === existing.assetId)?.tag },
                      { label: 'Document type', value: DOC_TYPE_LABEL[existing.type] },
                    ]}
                  />
                </div>
              )}
              {!isVersion && (
                <>
              <div>
                <Label htmlFor="projectId">Project</Label>
                <Select id="projectId" aria-invalid={!!form.formState.errors.projectId} {...form.register('projectId', { onChange: () => form.setValue('assetId', '') })}>
                  <option value="">Select project…</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </Select>
                <FieldError message={form.formState.errors.projectId?.message} />
              </div>
              <div>
                <Label htmlFor="assetId">Asset / equipment</Label>
                <Select id="assetId" disabled={!project} aria-invalid={!!form.formState.errors.assetId} {...form.register('assetId')}>
                  <option value="">{project ? 'Select asset…' : 'Select a project first'}</option>
                  {project?.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tag} — {a.name}
                    </option>
                  ))}
                </Select>
                <FieldError message={form.formState.errors.assetId?.message} />
              </div>
              <div>
                <Label htmlFor="type">Document type</Label>
                <Select id="type" aria-invalid={!!form.formState.errors.type} {...form.register('type')}>
                  <option value="">Select document type…</option>
                  {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <FieldError message={form.formState.errors.type?.message} />
              </div>
                </>
              )}
              <div>
                <Label htmlFor="revision">Document version / revision</Label>
                <Input id="revision" placeholder="Rev A" aria-invalid={!!form.formState.errors.revision} {...form.register('revision')} />
                <FieldError message={form.formState.errors.revision?.message} />
                {existing && <p className="mt-1 text-[11px] text-slate-400">Existing: {existing.versions.map((v) => v.revision).join(', ')}</p>}
              </div>
              {!isVersion && (
              <div className="md:col-span-2">
                <Label htmlFor="title">Document title</Label>
                <Input id="title" placeholder="e.g. HP Production Separator Equipment Data Sheet" aria-invalid={!!form.formState.errors.title} {...form.register('title')} />
                <FieldError message={form.formState.errors.title?.message} />
              </div>
              )}
              <div className="md:col-span-2">
                <Label htmlFor="changeNote">{isVersion ? 'What changed in this revision?' : 'Change note (optional)'}</Label>
                <Textarea id="changeNote" rows={2} placeholder={isVersion ? 'e.g. Corrected nozzle N2 flange rating per manager review comment' : 'Initial issue'} aria-invalid={!!form.formState.errors.changeNote} {...form.register('changeNote')} />
                <FieldError message={form.formState.errors.changeNote?.message} />
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button type="submit">
                  Continue <ArrowRight />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 1 && requirement && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Step 2 — Upload Excel workbook</CardTitle>
                <CardDescription>.xlsx or .xls · max 10 MB · macros are rejected · formulas are never executed</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <Dropzone onFile={onFile} busy={parse.state === 'reading'} />
              {parse.state === 'reading' && (
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <LoaderCircle className="size-4 animate-spin text-navy-600" /> Reading {file?.name}
                    </span>
                    <span className="text-xs text-slate-400">{file && formatBytes(file.size)}</span>
                  </div>
                  <Progress value={100} indeterminate />
                </div>
              )}
              {parse.state === 'error' && (
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#f5c2c2] bg-fail-soft p-4 text-sm text-fail">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">File rejected</p>
                    <p className="mt-0.5">{parse.error}</p>
                  </div>
                </div>
              )}
              {parse.state === 'done' && parse.result && <WorkbookPreview result={parse.result} onClear={() => (setFile(null), setParse({ state: 'idle' }))} />}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <StructureGuidance requirement={requirement} structure={structure} />
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Sample templates</CardTitle>
                  <CardDescription>Synthetic data for demonstrations only</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => downloadSampleWorkbook(requirement.documentType, 'dirty', `SAMPLE_${requirement.code}_with_errors.xlsx`)}>
                  <Download /> Sample with seeded errors
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => downloadSampleWorkbook(requirement.documentType, 'clean', `SAMPLE_${requirement.code}_corrected.xlsx`)}>
                  <Download /> Corrected sample (passes)
                </Button>
                <p className="text-[11px] leading-relaxed text-slate-500">Upload the errored sample first, then upload the corrected one as a new version to demonstrate the fix-and-resubmit loop.</p>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-between xl:col-span-3">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft /> Back
            </Button>
            <Button disabled={parse.state !== 'done'} onClick={() => setStep(2)}>
              Continue <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && requirement && parse.result && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Step 3 — Requirement document</CardTitle>
                <CardDescription>The workbook will be validated against this controlled specification.</CardDescription>
              </div>
              <BookOpenCheck className="size-5 text-navy-500" />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-4">
                <p className="font-mono text-xs text-navy-600">{requirement.code}</p>
                <p className="mt-0.5 text-base font-semibold text-navy-950">{requirement.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="info">{requirement.version}</Badge>
                  <Badge tone="neutral">Effective {formatDate(requirement.effectiveDate)}</Badge>
                  {requirement.standardRefs.map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Owner: {requirement.owner}</p>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Key rules</h3>
                <ul className="space-y-2">
                  {requirement.keyRules.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-slate-700">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-navy-500" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-slate-500">
                {requirement.columns.length} column rules and {requirement.crossRules.length} cross-field rules across {requirement.sheets.length} worksheets will be evaluated deterministically.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                <span>I confirm this workbook contains synthetic or approved demonstration data and is associated with the correct requirement document.</span>
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upload summary</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                className="sm:grid-cols-1"
                items={[
                  { label: 'Project', value: `${project?.code} — ${project?.name}` },
                  { label: 'Asset', value: project?.assets.find((a) => a.id === values.assetId)?.tag },
                  { label: 'Document type', value: DOC_TYPE_LABEL[values.type] },
                  { label: 'Title', value: values.title },
                  { label: 'Revision', value: values.revision },
                  { label: 'File', value: `${parse.result.meta.fileName} (${formatBytes(parse.result.meta.fileSize)})` },
                  { label: 'Worksheets', value: parse.result.meta.sheets.map((s) => `${s.name} (${s.rowCount})`).join(', ') },
                ]}
              />
            </CardContent>
          </Card>
          <div className="flex justify-between xl:col-span-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft /> Back
            </Button>
            <Button variant="accent" disabled={!confirmed} loading={createDoc.isPending || uploadVersion.isPending} onClick={finish}>
              <FileUp /> {isVersion ? 'Upload new version' : 'Upload document'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Dropzone({ onFile, busy }: { onFile: (f: File | undefined) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length > 1) toast.error('Upload one workbook at a time.');
        else onFile(e.dataTransfer.files[0]);
      }}
      className={cn('flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition', over ? 'border-navy-400 bg-navy-50' : 'border-slate-300 bg-slate-50/50')}
    >
      <UploadCloud className="size-9 text-navy-400" />
      <p className="mt-3 text-sm font-medium text-slate-700">Drag and drop your Excel workbook here</p>
      <p className="text-xs text-slate-500">or</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => ref.current?.click()}>
        Browse files
      </Button>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
        aria-label="Choose Excel file"
      />
    </div>
  );
}

function WorkbookPreview({ result, onClear }: { result: ParseResult; onClear: () => void }) {
  const [active, setActive] = useState(0);
  const sheet = result.workbook.sheets[active];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-[#bfe5cc] bg-ok-soft p-3">
        <FileSpreadsheet className="size-8 text-ok" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{result.meta.fileName}</p>
          <p className="text-xs text-slate-600">
            {formatBytes(result.meta.fileSize)} · {result.meta.sheets.length} worksheets · {result.meta.sheets.reduce((a, s) => a + s.columns.length, 0)} columns · {result.meta.sheets.reduce((a, s) => a + s.rowCount, 0)} data rows
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClear} aria-label="Remove file">
          <X />
        </Button>
      </div>
      {result.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
        </p>
      ))}
      <div>
        <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
          {result.workbook.sheets.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn('-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium', i === active ? 'border-accent text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800')}
            >
              {s.name} <span className="text-slate-400">({s.rows.length})</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Detected columns ({sheet.headers.length})</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {sheet.headers.map((h, i) => (
            <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {h || <em>(blank)</em>}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-400">Preview — first 5 rows</p>
        <div className="mt-1.5 rounded-md border border-border">
          <Table className="text-xs">
            <thead>
              <tr>
                <Th className="w-10 px-2">#</Th>
                {sheet.headers.map((h, i) => (
                  <Th key={i} className="px-2 normal-case tracking-normal">
                    {h}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.slice(0, 5).map((r, ri) => (
                <tr key={ri}>
                  <Td className="px-2 py-1.5 font-mono text-slate-400">{ri + 2}</Td>
                  {r.map((c, ci) => (
                    <Td key={ci} className="whitespace-nowrap px-2 py-1.5 font-mono">
                      {c === null ? <span className="text-slate-300">—</span> : String(c)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function StructureGuidance({ requirement, structure }: { requirement: RequirementDocument; structure: ReturnType<typeof analyseStructure> | null }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Required file structure</CardTitle>
          <CardDescription>
            {requirement.code} {requirement.version}
          </CardDescription>
        </div>
        <Info className="size-4 text-slate-400" />
      </CardHeader>
      <CardContent className="space-y-3">
        {requirement.sheets.map((s) => {
          const missing = structure?.missingSheets.some((m) => m.name === s.name);
          const cols = requirement.columns.filter((c) => c.sheet === s.name);
          return (
            <div key={s.name}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                {structure ? missing ? <CircleAlert className="size-3.5 text-fail" /> : <CircleCheck className="size-3.5 text-ok" /> : <FileSpreadsheet className="size-3.5 text-slate-400" />}
                {s.name}
                {!s.required && <span className="font-normal text-slate-400">(optional)</span>}
              </p>
              <div className="mt-1 flex flex-wrap gap-1 pl-5">
                {cols.map((c) => {
                  const colMissing = missing || structure?.missingColumns.some((m) => m.sheet === s.name && m.column === c.header);
                  return (
                    <span key={c.ruleId} className={cn('rounded px-1.5 py-0.5 text-[10px]', !structure ? 'bg-slate-100 text-slate-600' : colMissing ? 'bg-fail-soft text-fail' : 'bg-ok-soft text-ok')}>
                      {c.header}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {structure && (structure.missingSheets.length > 0 || structure.missingColumns.length > 0) && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            {structure.missingSheets.length} worksheet(s) and {structure.missingColumns.length} column(s) are missing. You can still upload — validation will report them as structural failures.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

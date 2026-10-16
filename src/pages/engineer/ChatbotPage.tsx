import {
  ArrowRight,
  Bot,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Download,
  FileSearch,
  FileSpreadsheet,
  FlaskConical,
  Info,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
  ShieldAlert,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState, KeyValue, LoadingBlock, PageHeader, PageLoading } from '@/components/common';
import { Badge, CheckBadge, SeverityBadge, StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Progress } from '@/components/ui/primitives';
import { answer, segments, type AssistantAction } from '@/features/chatbot/assistant';
import { exportReportXlsx } from '@/features/validation/exportReport';
import { analyseStructure } from '@/features/validation/engine';
import { OverallBadge } from '@/features/validation/ValidationSummary';
import { manualTestBlockers, VALIDATABLE_STAGES } from '@/features/workflow/workflow';
import { useDocument, useDocuments, useProjects, useReport, useRequirements, useRunValidation } from '@/hooks/queries';
import { DOC_TYPE_LABEL } from '@/lib/labels';
import { cn, formatTime, relativeTime } from '@/lib/utils';
import { isApiError } from '@/services/apiError';
import type { EngDocument, RequirementDocument, ValidationFinding, ValidationReport } from '@/types';

export function ChatbotPage() {
  const { id } = useParams();
  if (!id) return <SessionPicker />;
  return <ChatLoader id={id} key={id} />;
}

function SessionPicker() {
  const docs = useDocuments({ mine: true, stage: VALIDATABLE_STAGES, sort: 'updatedAt', dir: 'desc', pageSize: 24 });
  return (
    <>
      <PageHeader title="Validation chatbot" description="Pick a document to start a guided validation session against its requirement document." crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Validation Chatbot' }]} />
      {docs.isLoading ? (
        <LoadingBlock />
      ) : docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
      ) : !docs.data?.items.length ? (
        <Card>
          <EmptyState icon={Bot} title="No documents ready for validation" description="Upload a workbook to start a validation session." action={<Button asChild><Link to="/upload">Upload document</Link></Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docs.data.items.map((d) => (
            <Card key={d.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <FileSpreadsheet className="size-8 shrink-0 text-navy-400" />
                <StageBadge stage={d.stage} />
              </div>
              <p className="mt-3 font-medium text-slate-900">{d.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-mono">{d.docNumber}</span> · {d.revision} · {DOC_TYPE_LABEL[d.type]}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Updated {relativeTime(d.updatedAt)}</p>
              <Button asChild className="mt-4 w-full" variant={d.stage === 'uploaded' ? 'accent' : 'outline'}>
                <Link to={`/validate/${d.id}`}>
                  <Bot /> {d.stage === 'uploaded' ? 'Start validation' : 'Open session'}
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ChatLoader({ id }: { id: string }) {
  const doc = useDocument(id);
  const reqs = useRequirements();
  if (doc.isLoading || reqs.isLoading) return <PageLoading />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  if (reqs.isError) return <ErrorState error={reqs.error} />;
  const req = reqs.data!.find((r) => r.id === doc.data!.requirementId)!;
  return <ChatSession doc={doc.data!} req={req} />;
}

// ---------------------------------------------------------------------------

type Phase = 'intro' | 'context' | 'scope' | 'select' | 'rules' | 'running' | 'complete' | 'unavailable' | 'blocked' | 'idle' | 'error';
type CardData =
  | { kind: 'context' }
  | { kind: 'structure' }
  | { kind: 'sheets' }
  | { kind: 'rules'; all?: boolean }
  | { kind: 'progress'; runId: number; sheets: string[] }
  | { kind: 'summary'; reportId: string }
  | { kind: 'findings'; status: 'failed' | 'warning'; findings: ValidationFinding[]; total: number }
  | { kind: 'notice'; tone: 'warn' | 'fail' | 'info'; text: string };
interface Msg {
  id: number;
  from: 'bot' | 'user';
  at: string;
  text?: string;
  card?: CardData;
  refused?: boolean;
}

const QUICK: Partial<Record<Phase, string[]>> = {
  intro: ['Yes, start validation', 'Show file details'],
  context: ['Confirm and continue', 'Details are wrong'],
  scope: ['Validate all worksheets', 'Select worksheets'],
  rules: ['Yes, run validation', 'Show all rules', 'Cancel'],
  complete: ['Review detailed report', 'Show errors', 'Show warnings', 'Download report', 'How do I fix errors?', 'Rerun validation'],
  unavailable: ['Use synthetic sample data', 'Upload the file again'],
  idle: ['Start validation'],
  error: ['Retry validation'],
};

function ChatSession({ doc, req }: { doc: EngDocument; req: RequirementDocument }) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const run = useRunValidation();
  const version = doc.versions.find((v) => v.versionNo === doc.currentVersion)!;
  const priorReport = useReport(doc.latestReportId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [sheets, setSheets] = useState<string[] | undefined>(undefined);
  const [reportId, setReportId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<number, 'running' | 'done' | 'error'>>({});
  const report = useReport(reportId).data ?? null;
  const counter = useRef(0);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const project = projects?.find((p) => p.id === doc.projectId);
  const structure = useMemo(() => analyseStructure(req, { formulaCellCount: 0, sheets: version.file.sheets.map((s) => ({ name: s.name, headers: s.columns, rows: [] })) }), [req, version]);
  const activeReport: ValidationReport | null = report ?? (priorReport.data && priorReport.data.versionNo === doc.currentVersion ? priorReport.data : null);

  const push = (m: Omit<Msg, 'id' | 'at'>) => setMessages((prev) => [...prev, { ...m, id: ++counter.current, at: new Date().toISOString() }]);
  /** Queue bot messages with a short typing indicator so replies feel conversational. */
  const say = (msgs: Omit<Msg, 'id' | 'at' | 'from'>[], next?: Phase) => {
    queue.current = queue.current.then(async () => {
      for (const m of msgs) {
        if (!alive.current) return;
        setTyping(true);
        await new Promise((r) => setTimeout(r, 450 + Math.min(900, (m.text?.length ?? 40) * 6)));
        if (!alive.current) return;
        setTyping(false);
        push({ ...m, from: 'bot' });
      }
      if (next && alive.current) setPhase(next);
    });
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Opening message (runs once per session; UI choreography only — data comes from TanStack Query).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!VALIDATABLE_STAGES.includes(doc.stage)) {
      say([{ text: `**${doc.docNumber}** is currently in the stage “${doc.stage.replace(/_/g, ' ')}”. Validation can’t be run at this stage — the document is locked while it is awaiting approval or handover. You can review its reports from the document page.`, card: { kind: 'notice', tone: 'info', text: 'Workflow rules are enforced by the API as well as in this conversation.' } }], 'blocked');
      return;
    }
    const cols = version.file.sheets.reduce((a, s) => a + s.columns.length, 0);
    say(
      [
        {
          text: `Welcome! I have detected your uploaded Excel file **${version.file.fileName}** for **${doc.docNumber} ${version.revision}** — ${version.file.sheets.length} worksheets and ${cols} columns. Would you like to validate it against the selected engineering requirements?`,
        },
      ],
      'intro',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const startRun = (useSynthetic = false) => {
    const runId = ++counter.current;
    const scopeSheets = sheets ?? version.file.sheets.map((s) => s.name);
    setRuns((r) => ({ ...r, [runId]: 'running' }));
    setPhase('running');
    push({ from: 'bot', text: `Running ${req.code} ${req.version} checks${sheets ? ` on ${sheets.length} selected worksheet(s)` : ' on all worksheets'}…`, card: { kind: 'progress', runId, sheets: scopeSheets } });
    run.mutate(
      { id: doc.id, sheets, useSynthetic },
      {
        onSuccess: (r) => {
          setRuns((x) => ({ ...x, [runId]: 'done' }));
          setReportId(r.id);
          const t = r.totals;
          say(
            [
              {
                text: `Validation is complete. I found **${t.passedChecks} passed checks**, **${t.failedChecks} failed checks** and **${t.warningChecks} warnings** across ${t.rowsChecked} rows — that is **${t.failingRows} unique failing row${t.failingRows === 1 ? '' : 's'}**${t.criticalFailures ? `, including ${t.criticalFailures} critical failure(s)` : ''}. Would you like to review the detailed report?`,
                card: { kind: 'summary', reportId: r.id },
              },
              ...(r.scope === 'partial' ? [{ card: { kind: 'notice', tone: 'warn', text: 'This was a partial-scope run. A full validation of all worksheets is required before the document can be submitted.' } as CardData }] : []),
            ],
            'complete',
          );
        },
        onError: (e) => {
          setRuns((x) => ({ ...x, [runId]: 'error' }));
          if (isApiError(e) && e.code === 'FILE_UNAVAILABLE') {
            say([{ text: e.message, card: { kind: 'notice', tone: 'warn', text: 'Uploaded workbook contents live only in memory for this browser session and are never written to browser storage.' } }], 'unavailable');
          } else {
            say([{ text: isApiError(e) ? e.message : 'Validation could not be completed.', card: { kind: 'notice', tone: 'fail', text: 'No status change was recorded.' } }], 'error');
          }
        },
      },
    );
  };

  const doAction = (a: AssistantAction | undefined, r: ValidationReport | null) => {
    if (!a) return;
    if (a === 'show_errors' || a === 'show_warnings') {
      if (!r) return;
      const status = a === 'show_errors' ? 'failed' : 'warning';
      const list = r.findings.filter((f) => f.status === status);
      say([list.length ? { card: { kind: 'findings', status, findings: list.slice(0, 6), total: list.length } } : { text: status === 'failed' ? 'There are no failed checks. 🎉' : 'There are no warnings.' }]);
    }
    if (a === 'open_report' && r) navigate(`/reports/${r.id}`);
    if (a === 'download' && r) exportReportXlsx(r, { docNumber: doc.docNumber, title: doc.title }).then(() => toast.success('Report downloaded'));
    if (a === 'rerun') say([{ text: 'Should I validate all worksheets or only selected worksheets?' }], 'scope');
    if (a === 'manual_testing') navigate(`/manual-testing/${doc.id}`);
    if (a === 'upload_version') say([{ card: { kind: 'notice', tone: 'info', text: 'Use “Upload corrected version” in the side panel to register the fixed workbook as a new revision.' } }]);
    if (a === 'show_rules') say([{ card: { kind: 'rules', all: true } }]);
  };

  const onQuick = (label: string) => {
    if (typing || phase === 'running') return;
    push({ from: 'user', text: label });
    const r = activeReport;
    switch (label) {
      case 'Yes, start validation':
      case 'Start validation':
        return say([{ text: 'Before I start, please confirm the validation context:', card: { kind: 'context' } }], 'context');
      case 'Show file details':
        return say([{ card: { kind: 'structure' } }], 'intro');
      case 'Confirm and continue': {
        const extra = structure.missingSheets.length || structure.missingColumns.length;
        return say(
          [
            {
              text: `I found **${structure.sheetCount} worksheets** and **${structure.columnCount} columns**.${extra ? ` ${structure.missingSheets.length} required worksheet(s) and ${structure.missingColumns.length} column(s) are missing — they will be reported as structural failures.` : ' All required worksheets and columns are present.'}`,
              card: { kind: 'structure' },
            },
            { text: 'Should I validate all worksheets or only selected worksheets?' },
          ],
          'scope',
        );
      }
      case 'Details are wrong':
        return say([{ text: 'No problem. Project, asset and document type are fixed for this document. If the file or revision is wrong, upload a corrected version from the side panel; otherwise open the document page to review its details.' }], 'idle');
      case 'Validate all worksheets':
        setSheets(undefined);
        return say([rulesMessage()], 'rules');
      case 'Select worksheets':
        return say([{ text: 'Choose the worksheets to validate:', card: { kind: 'sheets' } }], 'select');
      case 'Yes, run validation':
      case 'Retry validation':
        return startRun();
      case 'Show all rules':
        return say([{ card: { kind: 'rules', all: true } }, { text: 'Shall I continue with validation?' }], 'rules');
      case 'Cancel':
        return say([{ text: 'Validation cancelled. Nothing was changed.' }], 'idle');
      case 'Review detailed report':
        return doAction('open_report', r);
      case 'Show errors':
        return doAction('show_errors', r);
      case 'Show warnings':
        return doAction('show_warnings', r);
      case 'Download report':
        return doAction('download', r);
      case 'How do I fix errors?':
        return say([{ text: answer('how do i fix', req, r).text }]);
      case 'Rerun validation':
        return doAction('rerun', r);
      case 'Continue to manual testing':
        return doAction('manual_testing', r);
      case 'Use synthetic sample data':
        return startRun(true);
      case 'Upload the file again':
        return navigate(`/upload?documentId=${doc.id}`);
    }
  };

  function rulesMessage(): Omit<Msg, 'id' | 'at' | 'from'> {
    const crit = req.columns.filter((c) => c.severity === 'critical').slice(0, 2).map((c) => c.header);
    const ranged = req.columns.find((c) => c.min !== undefined);
    const unit = req.columns.find((c) => c.isUnit);
    return {
      text: `The requirements specify that **${[...new Set(crit)].join('** and **')}** ${crit.length > 1 ? 'are' : 'is'} mandatory${ranged ? `, **${ranged.header}** must be within ${ranged.min}–${ranged.max}` : ''}${unit ? `, and all units must follow the approved standard (${unit.allowed?.join(', ')})` : ''}. ${req.columns.length + req.crossRules.length} rules in total. Shall I continue?`,
      card: { kind: 'rules' },
    };
  }

  const onSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim().slice(0, 500);
    if (!text || typing || phase === 'running') return;
    setInput('');
    push({ from: 'user', text });
    const reply = answer(text, req, activeReport);
    say([{ text: reply.text, refused: reply.refused }]);
    if (reply.action === 'rerun') return doAction('rerun', activeReport);
    if (reply.action) setTimeout(() => doAction(reply.action, activeReport), 900);
  };

  const canManual = activeReport && manualTestBlockers({ ...doc, stage: activeReport.overall === 'failed' ? 'validation_failed' : 'validation_passed' }, activeReport).length === 0;
  const quick = [...(QUICK[phase] ?? []), ...(phase === 'complete' && canManual ? ['Continue to manual testing'] : [])];

  const renderCard = (c: CardData, msg: Msg) => {
    switch (c.kind) {
      case 'context':
        return (
          <div className="rounded-lg border border-border bg-white p-3">
            <KeyValue
              items={[
                { label: 'Project', value: `${project?.code} — ${project?.name}` },
                { label: 'Document type', value: DOC_TYPE_LABEL[doc.type] },
                { label: 'Requirement', value: `${req.code} ${req.version}` },
                { label: 'Document version', value: `${version.revision} (v${version.versionNo})` },
              ]}
            />
          </div>
        );
      case 'structure':
        return (
          <div className="space-y-2 rounded-lg border border-border bg-white p-3 text-xs">
            {version.file.sheets.map((s) => (
              <div key={s.name}>
                <p className="font-semibold text-slate-700">
                  {s.name} <span className="font-normal text-slate-400">· {s.rowCount} rows · {s.columns.length} columns</span>
                </p>
                <p className="mt-0.5 text-slate-500">{s.columns.join(', ')}</p>
              </div>
            ))}
            {structure.missingSheets.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 text-fail">
                <CircleAlert className="size-3.5" /> Missing worksheet: {s.name}
              </p>
            ))}
            {structure.missingColumns.map((c) => (
              <p key={c.sheet + c.column} className="flex items-center gap-1.5 text-fail">
                <CircleAlert className="size-3.5" /> Missing column: {c.column} ({c.sheet})
              </p>
            ))}
            {structure.extraSheets.length > 0 && <p className="text-slate-500">Not covered by the requirement (ignored): {structure.extraSheets.join(', ')}</p>}
          </div>
        );
      case 'sheets':
        return <SheetPicker disabled={phase !== 'select' || msg.id !== messages.filter((m) => m.card?.kind === 'sheets').at(-1)?.id} sheets={version.file.sheets.map((s) => s.name)} onConfirm={(sel) => {
          setSheets(sel.length === version.file.sheets.length ? undefined : sel);
          push({ from: 'user', text: `Validate: ${sel.join(', ')}` });
          say([rulesMessage()], 'rules');
        }} />;
      case 'rules':
        return (
          <div className="rounded-lg border border-border bg-white p-3 text-xs">
            <p className="font-mono text-[11px] text-navy-600">
              {req.code} {req.version} · {req.title}
            </p>
            <ul className="mt-2 space-y-1">
              {(c.all ? req.columns.map((x) => `${x.ruleId} — ${x.description}`).concat(req.crossRules.map((x) => `${x.ruleId} — ${x.description}`)) : req.keyRules).map((r) => (
                <li key={r} className="flex gap-1.5 text-slate-600">
                  <CircleCheck className="mt-0.5 size-3 shrink-0 text-navy-400" /> {r}
                </li>
              ))}
            </ul>
          </div>
        );
      case 'progress':
        return <ProgressCard sheets={c.sheets} status={runs[c.runId] ?? 'done'} />;
      case 'summary':
        return <SummaryCard reportId={c.reportId} onOpen={() => navigate(`/reports/${c.reportId}`)} />;
      case 'findings':
        return (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <ul className="divide-y divide-slate-100">
              {c.findings.map((f) => (
                <li key={f.id} className="px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CheckBadge status={f.status} />
                    <SeverityBadge severity={f.severity} />
                    <span className="text-slate-500">
                      {f.sheet} · row {f.row ?? '—'} · {f.field}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">{f.message}</p>
                  <p className="font-mono text-[10px] text-slate-400">
                    actual “{f.actual}” · expected {f.expected} · {f.ruleId}
                  </p>
                </li>
              ))}
            </ul>
            {c.total > c.findings.length && (
              <Link to={`/reports/${reportId ?? activeReport?.id}`} className="block border-t border-border bg-slate-50 px-3 py-2 text-center text-xs font-medium text-navy-600 hover:underline">
                View all {c.total} in the report
              </Link>
            )}
          </div>
        );
      case 'notice':
        return (
          <p className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-xs', c.tone === 'warn' ? 'bg-warn-soft text-warn' : c.tone === 'fail' ? 'bg-fail-soft text-fail' : 'bg-navy-50 text-navy-700')}>
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {c.text}
          </p>
        );
    }
  };

  return (
    <>
      <PageHeader
        title="Validation chatbot"
        crumbs={[{ label: 'Validation Chatbot', to: '/validate' }, { label: doc.docNumber }]}
        description={`${doc.title} · ${version.revision}`}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-navy-900 text-white">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">DIPA Validation Assistant</p>
              <p className="text-[11px] text-slate-500">Scripted, rule-based assistant · {req.code} {req.version}</p>
            </div>
            {phase === 'running' && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                <LoaderCircle className="size-3 animate-spin" /> Validating
              </span>
            )}
          </div>
          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-4 py-5 sm:px-6" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex gap-3', m.from === 'user' && 'flex-row-reverse')}>
                <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', m.from === 'bot' ? 'bg-navy-900 text-white' : 'bg-accent-soft text-accent')}>
                  {m.from === 'bot' ? <Bot className="size-4" /> : <UserRound className="size-4" />}
                </span>
                <div className={cn('flex max-w-[85%] flex-col gap-2', m.from === 'user' && 'items-end')}>
                  {m.text && (
                    <div className={cn('whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.from === 'bot' ? 'rounded-tl-sm border border-border bg-white text-slate-700' : 'rounded-tr-sm bg-navy-800 text-white', m.refused && 'border-[#f5c2c2] bg-fail-soft text-fail')}>
                      {m.refused && <ShieldAlert className="mb-1 size-4" />}
                      {segments(m.text).map((s, i) => (s.bold ? <strong key={i} className="font-semibold">{s.text}</strong> : <span key={i}>{s.text}</span>))}
                    </div>
                  )}
                  {m.card && <div className="w-full min-w-[min(28rem,70vw)]">{renderCard(m.card, m)}</div>}
                  <time className="px-1 text-[10px] text-slate-400" dateTime={m.at}>
                    {formatTime(m.at)}
                  </time>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex gap-3" aria-label="Assistant is typing">
                <span className="grid size-7 place-items-center rounded-full bg-navy-900 text-white">
                  <Bot className="size-4" />
                </span>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-white px-4 py-3">
                  <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
                  <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
                  <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border bg-white px-4 py-3">
            {quick.length > 0 && !typing && (
              <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested replies">
                {quick.map((q) => (
                  <button key={q} type="button" onClick={() => onQuick(q)} className="cursor-pointer rounded-full border border-navy-200 bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 transition hover:border-navy-400 hover:bg-navy-100">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={onSend} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                disabled={phase === 'running'}
                placeholder={phase === 'running' ? 'Validation in progress…' : 'Ask about a rule, e.g. “What is the allowed range for Design Pressure?”'}
                aria-label="Message the validation assistant"
                className="h-10 flex-1 rounded-full border border-slate-300 px-4 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/15 disabled:bg-slate-50"
              />
              <Button type="submit" size="icon" className="size-10 rounded-full" disabled={!input.trim() || phase === 'running'} aria-label="Send">
                <SendHorizontal />
              </Button>
            </form>
          </div>
        </Card>

        <aside>
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="truncate">
                  <Link className="hover:underline" to={`/documents/${doc.id}`}>
                    {doc.docNumber}
                  </Link>
                </CardTitle>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={version.file.fileName}>
                  {version.file.fileName} · {req.code} {req.version}
                </p>
              </div>
              <StageBadge stage={doc.stage} />
            </CardHeader>
            <CardContent className="space-y-3">
              {activeReport ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Latest result</span>
                    <OverallBadge overall={activeReport.overall} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-ok-soft py-2 text-ok">
                      <p className="text-base font-semibold">{activeReport.totals.passedChecks}</p>passed
                    </div>
                    <div className="rounded-md bg-fail-soft py-2 text-fail">
                      <p className="text-base font-semibold">{activeReport.totals.failedChecks}</p>failed
                    </div>
                    <div className="rounded-md bg-warn-soft py-2 text-warn">
                      <p className="text-base font-semibold">{activeReport.totals.warningChecks}</p>warnings
                    </div>
                  </div>
                  {canManual && (
                    <Button asChild size="sm" className="w-full">
                      <Link to={`/manual-testing/${doc.id}`}>
                        <ClipboardCheck /> Continue to manual testing <ArrowRight />
                      </Link>
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/reports/${activeReport.id}`}>
                        <FileSearch /> Report
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportReportXlsx(activeReport, { docNumber: doc.docNumber, title: doc.title })}>
                      <Download /> Excel
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Not validated yet. Follow the assistant to run validation.</p>
              )}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to={`/upload?documentId=${doc.id}`}>
                  <RefreshCw /> Upload corrected version
                </Link>
              </Button>
              <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-slate-400">The assistant can’t approve documents or change workflow status.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function SheetPicker({ sheets, onConfirm, disabled }: { sheets: string[]; onConfirm: (s: string[]) => void; disabled?: boolean }) {
  const [sel, setSel] = useState<string[]>(sheets);
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="space-y-2">
        {sheets.map((s) => (
          <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <Checkbox disabled={disabled} checked={sel.includes(s)} onChange={(e) => setSel(e.target.checked ? [...sel, s] : sel.filter((x) => x !== s))} />
            {s}
          </label>
        ))}
      </div>
      {sel.length < sheets.length && sel.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warn">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" /> Partial validation cannot be used for submission.
        </p>
      )}
      <Button size="sm" className="mt-3" disabled={disabled || sel.length === 0} onClick={() => onConfirm(sel)}>
        Validate {sel.length} worksheet{sel.length === 1 ? '' : 's'}
      </Button>
    </div>
  );
}

function ProgressCard({ sheets, status }: { sheets: string[]; status: 'running' | 'done' | 'error' }) {
  const steps = [...sheets.map((s) => `Checking “${s}”`), 'Cross-field & duplicate checks', 'Compiling report'];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 520);
    return () => clearInterval(t);
  }, [status, steps.length]);
  const idx = status === 'done' ? steps.length : i;
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <Progress value={status === 'done' ? 100 : ((idx + 0.5) / steps.length) * 100} tone={status === 'error' ? 'fail' : status === 'done' ? 'ok' : 'navy'} indeterminate={status === 'running'} />
      <ul className="mt-3 space-y-1.5 text-xs">
        {steps.map((s, k) => (
          <li key={s} className={cn('flex items-center gap-2', k < idx ? 'text-slate-600' : k === idx && status === 'running' ? 'font-medium text-navy-700' : 'text-slate-400')}>
            {k < idx ? <CircleCheck className="size-3.5 text-ok" /> : k === idx && status === 'running' ? <LoaderCircle className="size-3.5 animate-spin" /> : status === 'error' && k === idx ? <CircleAlert className="size-3.5 text-fail" /> : <span className="size-3.5 rounded-full border border-slate-300" />}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ reportId, onOpen }: { reportId: string; onOpen: () => void }) {
  const { data: r } = useReport(reportId);
  if (!r) return null;
  const t = r.totals;
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <OverallBadge overall={r.overall} />
        <span className="text-[11px] text-slate-400">
          {t.rowsChecked} rows · {t.rulesChecked} rules · {t.checksPerformed} checks
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded bg-ok-soft py-2 text-ok"><p className="text-base font-semibold">{t.passedChecks}</p>passed</div>
        <div className="rounded bg-fail-soft py-2 text-fail"><p className="text-base font-semibold">{t.failedChecks}</p>failed</div>
        <div className="rounded bg-warn-soft py-2 text-warn"><p className="text-base font-semibold">{t.warningChecks}</p>warnings</div>
        <div className="rounded bg-slate-100 py-2 text-slate-700"><p className="text-base font-semibold">{t.failingRows}</p>failing rows</div>
      </div>
      {r.synthetic && <Badge tone="neutral" icon={FlaskConical} className="mt-2">Synthetic sample data</Badge>}
      <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onOpen}>
        <FileSearch /> Open detailed report
      </Button>
    </div>
  );
}

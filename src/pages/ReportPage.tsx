import { Bot, ClipboardCheck, Download, FileUp, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, KeyValue, PageHeader, PageLoading } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { exportReportXlsx } from '@/features/validation/exportReport';
import { FindingsTable } from '@/features/validation/FindingsTable';
import { CategoryBreakdown, SheetBreakdown, ValidationSummary } from '@/features/validation/ValidationSummary';
import { can, manualTestBlockers } from '@/features/workflow/workflow';
import { useDocument, useReport, useSession, useUsers } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';

export function ReportPage() {
  const { reportId } = useParams();
  const report = useReport(reportId);
  const doc = useDocument(report.data?.documentId);
  const { data: session } = useSession();
  const { data: users } = useUsers();
  if (report.isLoading || (report.data && doc.isLoading)) return <PageLoading />;
  if (report.isError) return <ErrorState error={report.error} />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  const r = report.data!;
  const d = doc.data!;
  const isCurrent = r.versionNo === d.currentVersion && r.id === d.latestReportId;
  const isOwner = can(session?.user, 'document.validate', d);
  const manualOk = isOwner && isCurrent && manualTestBlockers(d, r).length === 0;

  return (
    <>
      <PageHeader
        title="Validation report"
        description={
          <>
            <span className="font-mono">{d.docNumber}</span> · {d.title} · {r.revision}
            {!isCurrent && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Historical report — superseded</span>}
          </>
        }
        crumbs={[
          { label: session?.user.role === 'manager' ? 'All Documents' : 'Validation Reports', to: session?.user.role === 'manager' ? '/documents' : '/reports' },
          { label: d.docNumber, to: `/documents/${d.id}` },
          { label: `Report ${r.id}` },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => exportReportXlsx(r, { docNumber: d.docNumber, title: d.title }).then(() => toast.success('Excel report downloaded'))}>
              <Download /> Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} title="Opens the browser print dialog — choose “Save as PDF”">
              <Printer /> PDF
            </Button>
            {isOwner && isCurrent && r.totals.failedChecks + r.totals.warningChecks > 0 && (
              <Button variant="outline" asChild>
                <Link to={`/upload?documentId=${d.id}`}>
                  <FileUp /> Fix &amp; upload new version
                </Link>
              </Button>
            )}
            {isOwner && isCurrent && (
              <Button variant="outline" asChild>
                <Link to={`/validate/${d.id}`}>
                  <Bot /> Rerun in chatbot
                </Link>
              </Button>
            )}
            {manualOk && (
              <Button asChild>
                <Link to={`/manual-testing/${d.id}`}>
                  <ClipboardCheck /> Manual testing
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Card className="print-break mb-6">
        <CardContent>
          <ValidationSummary report={r} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Detailed results</CardTitle>
          </CardHeader>
          <FindingsTable report={r} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Traceability</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                className="sm:grid-cols-1"
                items={[
                  { label: 'Requirement document', value: `${r.requirementCode} ${r.requirementVersion}` },
                  { label: 'Document version', value: `v${r.versionNo} · ${r.revision}` },
                  { label: 'Run by', value: users?.find((u) => u.id === r.runBy)?.name ?? r.runBy },
                  { label: 'Run at', value: formatDate(r.runAt, true) },
                  { label: 'Scope', value: r.scope === 'full' ? 'All worksheets' : r.sheetsValidated.join(', ') },
                  { label: 'Data source', value: r.synthetic ? 'Synthetic sample dataset (prototype)' : 'Uploaded workbook (in-memory)' },
                  { label: 'Engine', value: 'Deterministic rule engine — no AI judgement' },
                ]}
              />
            </CardContent>
          </Card>
          <SheetBreakdown report={r} />
          <CategoryBreakdown report={r} />
        </div>
      </div>
    </>
  );
}

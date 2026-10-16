import { Bot, ClipboardCheck, FileSearch, FileUp, GitBranch, History, Inbox, ListChecks, Send, Undo2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ApprovalHistory, DocumentSummaryCard, ManualTestSummary, VersionHistory } from '@/components/DocumentSummary';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, PageLoading } from '@/components/common';
import { StageBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { WorkflowStepper } from '@/components/WorkflowStepper';
import { ValidationSummary } from '@/features/validation/ValidationSummary';
import { can, manualTestBlockers, NEW_VERSION_STAGES, VALIDATABLE_STAGES } from '@/features/workflow/workflow';
import { useAudit, useDocument, useReport, useSession } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';

export function DocumentDetailPage() {
  const { id } = useParams();
  const doc = useDocument(id);
  const { data: session } = useSession();
  const report = useReport(doc.data?.latestReportId);
  const audit = useAudit({ documentId: id, limit: 200 });
  if (doc.isLoading) return <PageLoading />;
  if (doc.isError) return <ErrorState error={doc.error} />;
  const d = doc.data!;
  const user = session?.user;
  const isEngineer = user?.role === 'engineer';
  const isOwner = can(user, 'document.validate', d);
  const version = d.versions.find((v) => v.versionNo === d.currentVersion)!;
  const lastDecision = d.approvals.at(-1);
  const session_ = d.manualTests[d.currentVersion];

  return (
    <>
      <PageHeader
        title={d.title}
        badge={<StageBadge stage={d.stage} />}
        description={
          <>
            <span className="font-mono">{d.docNumber}</span> · {version.revision} · updated {formatDate(d.updatedAt, true)}
          </>
        }
        crumbs={[{ label: isEngineer ? 'My Documents' : 'All Documents', to: '/documents' }, { label: d.docNumber }]}
        actions={
          <>
            {isOwner && NEW_VERSION_STAGES.includes(d.stage) && (
              <Button variant="outline" asChild>
                <Link to={`/upload?documentId=${d.id}`}>
                  <FileUp /> Upload new version
                </Link>
              </Button>
            )}
            {isOwner && VALIDATABLE_STAGES.includes(d.stage) && (
              <Button variant={d.stage === 'uploaded' || d.stage === 'changes_requested' ? 'accent' : 'outline'} asChild>
                <Link to={`/validate/${d.id}`}>
                  <Bot /> {d.stage === 'uploaded' ? 'Validate' : 'Rerun validation'}
                </Link>
              </Button>
            )}
            {isOwner && report.data && manualTestBlockers(d, report.data).length === 0 && (
              <Button variant={d.stage === 'ready_for_review' ? 'accent' : 'default'} asChild>
                <Link to={`/manual-testing/${d.id}`}>
                  {d.stage === 'ready_for_review' ? <Send /> : <ClipboardCheck />} {d.stage === 'ready_for_review' ? 'Submit for approval' : 'Manual testing'}
                </Link>
              </Button>
            )}
            {can(user, 'document.approve', d) && d.stage === 'pending_approval' && (
              <Button variant="accent" asChild>
                <Link to={`/review/${d.id}`}>
                  <Inbox /> Review &amp; decide
                </Link>
              </Button>
            )}
            {can(user, 'document.vendor_submit', d) && d.stage === 'vendor_ready' && (
              <Button variant="accent" asChild>
                <Link to={`/vendor/${d.id}`}>
                  <Send /> Vendor handover
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-6 px-4 py-5">
        <WorkflowStepper stage={d.stage} />
      </Card>

      {d.stage === 'changes_requested' && lastDecision?.decision === 'changes_requested' && (
        <div className="mb-6 flex gap-3 rounded-lg border border-[#f6d999] bg-warn-soft p-4">
          <Undo2 className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="text-sm">
            <p className="font-semibold text-warn">
              Changes requested by {lastDecision.reviewerName} on {formatDate(lastDecision.decidedAt, true)} ({lastDecision.revision})
            </p>
            <p className="mt-1 text-slate-700">“{lastDecision.comment}”</p>
            {isOwner && <p className="mt-2 text-xs text-slate-600">Correct the data, upload a new version (or rerun validation if no data change is needed), repeat manual testing and resubmit.</p>}
          </div>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <ListChecks /> Overview
          </TabsTrigger>
          <TabsTrigger value="versions">
            <GitBranch /> Versions ({d.versions.length})
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <Send /> Approvals ({d.submissions.length + d.approvals.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History /> Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <DocumentSummaryCard doc={d} />
            <Card>
              <CardHeader>
                <CardTitle>Latest validation — current version</CardTitle>
                {report.data && (
                  <Button variant="link" size="sm" asChild>
                    <Link to={`/reports/${report.data.id}`}>
                      <FileSearch /> Full report
                    </Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!d.latestReportId ? (
                  <EmptyState title="Not validated yet" description="Run the guided validation to check this version against its requirement document." action={isOwner && VALIDATABLE_STAGES.includes(d.stage) ? <Button asChild size="sm"><Link to={`/validate/${d.id}`}><Bot /> Start validation</Link></Button> : undefined} />
                ) : report.isLoading ? (
                  <LoadingBlock rows={3} className="p-0" />
                ) : report.data ? (
                  <ValidationSummary report={report.data} compact />
                ) : null}
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Manual testing — {version.revision}</CardTitle>
              </CardHeader>
              <CardContent>
                <ManualTestSummary session={session_} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <Card>
            <VersionHistory doc={d} />
          </Card>
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalHistory doc={d} />
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardContent>{audit.isLoading ? <LoadingBlock rows={4} className="p-0" /> : <AuditTimeline events={audit.data ?? []} />}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

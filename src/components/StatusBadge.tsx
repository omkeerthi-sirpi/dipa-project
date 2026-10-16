import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  FilePen,
  FileUp,
  Hourglass,
  LoaderCircle,
  PackageCheck,
  Send,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APPROVAL_LABEL, MANUAL_LABEL, SEVERITY_LABEL, STAGE_LABEL, VALIDATION_LABEL, VENDOR_LABEL } from '@/lib/labels';
import type { ApprovalStatus, CheckStatus, ManualTestStatus, Severity, ValidationStatus, VendorStatus, WorkflowStage } from '@/types';

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'fail' | 'accent' | 'solid';

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-navy-50 text-navy-700 ring-navy-100',
  ok: 'bg-ok-soft text-ok ring-[#bfe5cc]',
  warn: 'bg-warn-soft text-warn ring-[#f6d999]',
  fail: 'bg-fail-soft text-fail ring-[#f5c2c2]',
  accent: 'bg-accent-soft text-[#b4500f] ring-[#f8cfb3]',
  solid: 'bg-navy-900 text-white ring-navy-900',
};

export function Badge({ tone = 'neutral', icon: Icon, children, className, spin }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string; spin?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONE[tone], className)}>
      {Icon && <Icon className={cn('size-3 shrink-0', spin && 'animate-spin')} aria-hidden />}
      {children}
    </span>
  );
}

const STAGE_META: Record<WorkflowStage, { tone: Tone; icon: LucideIcon; spin?: boolean }> = {
  draft: { tone: 'neutral', icon: FilePen },
  uploaded: { tone: 'info', icon: FileUp },
  validation_in_progress: { tone: 'info', icon: LoaderCircle, spin: true },
  validation_failed: { tone: 'fail', icon: CircleX },
  validation_passed: { tone: 'ok', icon: CircleCheck },
  manual_testing: { tone: 'info', icon: ClipboardCheck },
  ready_for_review: { tone: 'accent', icon: UserCheck },
  pending_approval: { tone: 'accent', icon: Hourglass },
  changes_requested: { tone: 'warn', icon: Undo2 },
  approved: { tone: 'ok', icon: ShieldCheck },
  vendor_ready: { tone: 'ok', icon: PackageCheck },
  vendor_submitted: { tone: 'solid', icon: Send },
};

export function StageBadge({ stage, className }: { stage: WorkflowStage; className?: string }) {
  const m = STAGE_META[stage];
  return (
    <Badge tone={m.tone} icon={m.icon} spin={m.spin} className={className}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const m: Record<ValidationStatus, [Tone, LucideIcon]> = {
    not_started: ['neutral', CircleDashed],
    in_progress: ['info', LoaderCircle],
    passed: ['ok', CircleCheck],
    passed_with_warnings: ['warn', TriangleAlert],
    failed: ['fail', CircleX],
  };
  const [tone, icon] = m[status];
  return (
    <Badge tone={tone} icon={icon} spin={status === 'in_progress'}>
      {VALIDATION_LABEL[status]}
    </Badge>
  );
}

export function ManualBadge({ status }: { status: ManualTestStatus }) {
  const m: Record<ManualTestStatus, [Tone, LucideIcon]> = { not_started: ['neutral', CircleDashed], in_progress: ['info', ClipboardCheck], completed: ['ok', CircleCheck], failed: ['fail', CircleX] };
  const [tone, icon] = m[status];
  return (
    <Badge tone={tone} icon={icon}>
      {MANUAL_LABEL[status]}
    </Badge>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const m: Record<ApprovalStatus, [Tone, LucideIcon]> = { not_submitted: ['neutral', CircleDashed], pending: ['accent', Hourglass], approved: ['ok', ShieldCheck], changes_requested: ['warn', Undo2] };
  const [tone, icon] = m[status];
  return (
    <Badge tone={tone} icon={icon}>
      {APPROVAL_LABEL[status]}
    </Badge>
  );
}

export function VendorBadge({ status }: { status: VendorStatus }) {
  const m: Record<VendorStatus, [Tone, LucideIcon]> = { not_ready: ['neutral', Ban], ready: ['ok', PackageCheck], submitted: ['solid', Send] };
  const [tone, icon] = m[status];
  return (
    <Badge tone={tone} icon={icon}>
      {VENDOR_LABEL[status]}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone: Tone = severity === 'critical' ? 'fail' : severity === 'major' ? 'accent' : 'warn';
  return <Badge tone={tone}>{SEVERITY_LABEL[severity]}</Badge>;
}

export function CheckBadge({ status }: { status: CheckStatus }) {
  if (status === 'passed') return <Badge tone="ok" icon={CircleCheck}>Passed</Badge>;
  if (status === 'warning') return <Badge tone="warn" icon={TriangleAlert}>Warning</Badge>;
  return <Badge tone="fail" icon={CircleX}>Failed</Badge>;
}

import { Check, CircleX, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowStage } from '@/types';

const STEPS: { key: string; label: string; stages: WorkflowStage[] }[] = [
  { key: 'upload', label: 'Uploaded', stages: ['draft', 'uploaded'] },
  { key: 'validate', label: 'Automated validation', stages: ['validation_in_progress', 'validation_failed', 'validation_passed'] },
  { key: 'manual', label: 'Manual testing', stages: ['manual_testing', 'ready_for_review'] },
  { key: 'approval', label: 'Manager approval', stages: ['pending_approval', 'changes_requested', 'approved'] },
  { key: 'vendor', label: 'Vendor handover', stages: ['vendor_ready', 'vendor_submitted'] },
];

export function WorkflowStepper({ stage, className }: { stage: WorkflowStage; className?: string }) {
  const current = STEPS.findIndex((s) => s.stages.includes(stage));
  const problem = stage === 'validation_failed' ? 'fail' : stage === 'changes_requested' ? 'changes' : null;
  const done = stage === 'vendor_submitted';
  return (
    <ol className={cn('flex w-full items-start', className)} aria-label="Workflow progress">
      {STEPS.map((s, i) => {
        const complete = i < current || done;
        const active = i === current && !done;
        const isProblem = active && problem;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span className={cn('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', i <= current || done ? 'bg-navy-600' : 'bg-slate-200')} aria-hidden />}
            <span
              className={cn(
                'relative z-10 grid size-7 place-items-center rounded-full border-2 text-xs font-semibold',
                complete && 'border-navy-600 bg-navy-600 text-white',
                active && !isProblem && 'border-accent bg-white text-accent',
                isProblem === 'fail' && 'border-fail bg-fail-soft text-fail',
                isProblem === 'changes' && 'border-warn bg-warn-soft text-warn',
                !complete && !active && 'border-slate-200 bg-white text-slate-400',
              )}
            >
              {complete ? <Check className="size-3.5" /> : isProblem === 'fail' ? <CircleX className="size-3.5" /> : isProblem === 'changes' ? <Undo2 className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('mt-1.5 px-1 text-[11px] leading-tight', active ? 'font-semibold text-slate-800' : 'text-slate-500')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

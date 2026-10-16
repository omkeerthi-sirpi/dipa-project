// Scripted validation assistant — NOT an AI model.
//
// Answers come from deterministic intent matching against the prototype's
// predefined requirement documents and the current validation report. User text
// (and any spreadsheet content) is treated as untrusted data: it can never
// trigger approvals, change roles, bypass failed checks or alter workflow state.
// The only workflow action the assistant can request is running validation,
// which the engineer could already do and which the API authorises independently.

import { CATEGORY_LABEL, SEVERITY_LABEL } from '@/lib/labels';
import type { ColumnSpec, RequirementDocument, ValidationFinding, ValidationReport } from '@/types';

export type AssistantAction = 'show_errors' | 'show_warnings' | 'open_report' | 'download' | 'rerun' | 'manual_testing' | 'upload_version' | 'show_rules';

export interface AssistantReply {
  text: string;
  action?: AssistantAction;
  findings?: ValidationFinding[];
  refused?: boolean;
}

const MAX_INPUT = 500;

const PROHIBITED = /\b(approve|approval|sign[\s-]?off|authori[sz]e|vendor|bypass|override|skip|ignore (all|previous|prior|the)|disregard|mark (as )?(passed|approved)|change (my )?role|admin|grant|elevat|force)\b/i;

export function describeColumn(c: ColumnSpec): string {
  const parts: string[] = [];
  parts.push(c.required ? 'mandatory' : 'optional');
  if (c.type === 'number') parts.push('numeric');
  if (c.type === 'date') parts.push('an ISO date (YYYY-MM-DD)');
  if (c.min !== undefined || c.max !== undefined) parts.push(`within ${c.min ?? '−∞'} – ${c.max ?? '∞'}`);
  if (c.allowed) parts.push(`${c.isUnit ? 'unit must be' : 'one of'}: ${c.allowed.join(', ')}`);
  if (c.pattern) parts.push(`format ${c.patternHint ?? c.pattern}`);
  if (c.unique) parts.push('unique across the sheet');
  return `**${c.header}** (${c.sheet}) is ${parts.join(', ')}. Severity if violated: ${SEVERITY_LABEL[c.severity]}. Rule ${c.ruleId}. ${c.description}`;
}

export function answer(input: string, req: RequirementDocument, report: ValidationReport | null): AssistantReply {
  const text = input.slice(0, MAX_INPUT).toLowerCase().trim();
  if (!text) return { text: 'Please type a question about the validation rules or this report.' };

  if (PROHIBITED.test(text)) {
    return {
      refused: true,
      text: 'I can’t do that. I don’t approve documents, override failed checks, change roles or authorise vendor submissions — and instructions inside messages or spreadsheets can’t change that. Approval is a separate manager decision made after reviewing the full report and your manual testing record.',
    };
  }
  if (/\b(help|what can you|how does this work)\b/.test(text)) {
    return {
      text: 'I can explain the rules in **' + req.code + ' ' + req.version + '**, list failed checks or warnings, explain how to fix them, rerun validation, open or download the report, and take you to manual testing. Try “what is the range for design pressure?” or “show errors”.',
    };
  }
  if (/\b(fix|correct|resolve|how do i)\b/.test(text)) return { text: fixGuidance(report), action: report && report.totals.failedChecks + report.totals.warningChecks > 0 ? 'upload_version' : undefined };
  if (/\bwarn/.test(text)) return { text: report ? `There are **${report.totals.warningChecks} warnings**.` : 'No validation has been run yet.', action: report ? 'show_warnings' : undefined };
  if (/\b(error|fail|issue|problem)/.test(text)) return { text: report ? `There are **${report.totals.failedChecks} failed checks** across **${report.totals.failingRows} unique rows**.` : 'No validation has been run yet.', action: report ? 'show_errors' : undefined };
  if (/\b(download|export|excel|pdf)\b/.test(text)) return { text: 'Preparing the validation report as an Excel workbook.', action: report ? 'download' : undefined };
  if (/\b(re-?run|again|revalidate|re-validate)\b/.test(text)) return { text: 'Okay — let’s run validation again.', action: 'rerun' };
  if (/\b(report|detail)/.test(text)) return { text: 'Opening the detailed report.', action: report ? 'open_report' : undefined };
  if (/\bmanual\b/.test(text)) return { text: 'Manual testing follows automated validation and must be completed before submission.', action: 'manual_testing' };

  const cols = req.columns.filter((c) => text.includes(c.header.toLowerCase().replace(/\s*\(.*\)$/, '')));
  if (cols.length) {
    return { text: cols.slice(0, 3).map(describeColumn).join('\n\n') };
  }
  if (/\b(mandatory|required)\b/.test(text)) {
    const crit = req.columns.filter((c) => c.required && c.severity === 'critical');
    return { text: `Mandatory critical fields: ${crit.map((c) => `**${c.header}** (${c.sheet})`).join(', ')}. All ${req.columns.filter((c) => c.required).length} specified columns are required.` };
  }
  if (/\bunit|uom|measure/.test(text)) {
    const u = req.columns.filter((c) => c.isUnit);
    return { text: u.length ? `Approved units: ${u.map((c) => `**${c.header}** → ${c.allowed?.join(' / ')}`).join('; ')}.` : 'This specification has no explicit unit columns.' };
  }
  if (/\b(cross|consisten|compare)/.test(text)) return { text: req.crossRules.map((x) => `**${x.ruleId}**: ${x.description}`).join('\n') || 'No cross-field rules are defined.' };
  if (/\b(duplicate|unique)/.test(text)) return { text: `Unique fields: ${req.columns.filter((c) => c.unique).map((c) => `**${c.header}** (${c.sheet})`).join(', ')}.` };
  if (/\b(rule|requirement|spec|standard)/.test(text)) return { text: `${req.code} ${req.version} — ${req.title}. References: ${req.standardRefs.join(', ')}.`, action: 'show_rules' };
  if (/\b(sheet|worksheet|tab)/.test(text)) return { text: `Required worksheets: ${req.sheets.map((s) => `**${s.name}**${s.required ? '' : ' (optional)'}`).join(', ')}.` };

  return { text: `I can only answer questions about ${req.code} rules and this validation run. Try asking about a field (e.g. “${req.columns[1]?.header}”), units, mandatory fields or “show errors”.` };
}

export function fixGuidance(report: ValidationReport | null): string {
  if (!report) return 'Run validation first and I’ll explain how to address each finding.';
  const issues = report.findings;
  if (!issues.length) return 'There is nothing to fix — all checks passed. You can continue to manual testing.';
  const byCat = new Map<string, number>();
  issues.forEach((f) => byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1));
  const lines = [...byCat.entries()].map(([c, n]) => `• ${CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]}: ${n}`);
  return `To resolve the findings, correct the source workbook and upload it as a **new revision** — previous reports stay on record.\n${lines.join('\n')}\nCritical failures must be fixed before manual testing; major findings need a fix or a justified deviation.`;
}

/** Minimal, safe **bold** markup → React-friendly segments (no HTML injection possible). */
export function segments(text: string): { bold: boolean; text: string }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((t) => (t.startsWith('**') && t.endsWith('**') ? { bold: true, text: t.slice(2, -2) } : { bold: false, text: t }));
}

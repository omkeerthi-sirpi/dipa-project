import { CATEGORY_LABEL } from '@/lib/labels';
import type { ValidationReport } from '@/types';

/**
 * Neutralise spreadsheet formula injection: any text cell starting with a
 * formula trigger character is prefixed with an apostrophe so Excel treats it as text.
 */
export function safeCell(v: unknown): string | number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export async function exportReportXlsx(report: ValidationReport, meta: { docNumber: string; title: string }) {
  const XLSX = await import('xlsx');
  const t = report.totals;
  const summary = [
    ['DIPA Validation Report (prototype — simulated validation run)'],
    [],
    ['Document', meta.docNumber],
    ['Title', meta.title],
    ['Revision', report.revision],
    ['Requirement', `${report.requirementCode} ${report.requirementVersion}`],
    ['Run at', report.runAt],
    ['Scope', report.scope === 'full' ? 'All worksheets' : `Partial: ${report.sheetsValidated.join(', ')}`],
    ['Data source', report.synthetic ? 'Synthetic sample dataset' : 'Uploaded workbook'],
    ['Overall result', report.overall],
    [],
    ['Rows checked', t.rowsChecked],
    ['Rules checked', t.rulesChecked],
    ['Field-level checks performed', t.checksPerformed],
    ['Passed checks', t.passedChecks],
    ['Failed checks', t.failedChecks],
    ['Warnings', t.warningChecks],
    ['Critical failures', t.criticalFailures],
    ['Unique failing rows', t.failingRows],
    ['Rows with warnings only', t.warningRows],
  ].map((r) => r.map(safeCell));
  const findings = [
    ['Status', 'Severity', 'Rule ID', 'Category', 'Worksheet', 'Excel row', 'Field', 'Actual value', 'Expected', 'Description'],
    ...report.findings.map((f) => [f.status, f.severity, f.ruleId, CATEGORY_LABEL[f.category], f.sheet, f.row ?? '', f.field, f.actual, f.expected, f.message]),
    ...report.passedRules.map((p) => ['passed', p.severity, p.ruleId, CATEGORY_LABEL[p.category], p.sheet, `${p.passedCount} checks`, p.field, '', p.expected, 'All evaluated cells passed']),
  ].map((r) => r.map(safeCell));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  const ws = XLSX.utils.aoa_to_sheet(findings);
  ws['!cols'] = [10, 10, 16, 24, 20, 10, 24, 22, 28, 50].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Findings');
  const safeName = `${meta.docNumber}_${report.revision}_validation`.replace(/[^A-Za-z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

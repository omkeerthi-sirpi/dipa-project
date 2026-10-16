// Deterministic, rule-based validation engine.
//
// Every objective check (required fields, types, allowed values, ranges,
// duplicates, cross-field and unit rules) is evaluated here from the
// requirement document — never by a language model. Each finding is traceable
// to requirement version, rule id, worksheet, row and field.
//
// In production this module runs server-side against the stored workbook;
// the prototype runs it inside the mock API layer.

import type {
  ColumnSpec,
  OverallValidation,
  ParsedWorkbook,
  PassedRuleSummary,
  RequirementDocument,
  Severity,
  ValidationCategory,
  ValidationFinding,
  RowSnapshot,
  ValidationReport,
} from '@/types';

export const MAX_FINDINGS = 500;
export const MAX_ROW_SNAPSHOTS = 100;
const MAX_CELL_CHARS = 256;

type Cell = string | number | null | undefined;

export interface EngineResult {
  scope: 'full' | 'partial';
  sheetsValidated: string[];
  totals: ValidationReport['totals'];
  bySheet: ValidationReport['bySheet'];
  byCategory: ValidationReport['byCategory'];
  overall: OverallValidation;
  findings: ValidationFinding[];
  passedRules: PassedRuleSummary[];
  rowSnapshots: RowSnapshot[];
  truncated: boolean;
}

const isEmpty = (v: Cell) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const display = (v: Cell) => (isEmpty(v) ? '(empty)' : String(v).slice(0, MAX_CELL_CHARS));
const norm = (s: string) => s.trim().toLowerCase();

export function toNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** Strict ISO date (YYYY-MM-DD) with calendar validation; returns epoch ms. */
export function toDate(v: Cell): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date.getTime() : null;
}

function enumMatches(v: Cell, allowed: string[]) {
  const s = String(v).trim();
  if (allowed.includes(s)) return true;
  // Numeric enums such as joint efficiency: compare numerically (0.85 === "0.85").
  const n = toNumber(v);
  return n !== null && allowed.some((a) => toNumber(a) === n);
}

const statusFor = (s: Severity) => (s === 'minor' ? 'warning' : 'failed') as 'warning' | 'failed';

export function validateWorkbook(req: RequirementDocument, wb: ParsedWorkbook, selectedSheets?: string[]): EngineResult {
  const findings: ValidationFinding[] = [];
  const passed = new Map<string, PassedRuleSummary>();
  const rulesChecked = new Set<string>();
  let truncated = false;

  const workbookSheets = new Map(wb.sheets.map((s) => [norm(s.name), s]));
  const inScope = (name: string) => !selectedSheets || selectedSheets.some((s) => norm(s) === norm(name));
  const scope: 'full' | 'partial' = req.sheets.every((s) => inScope(s.name) || !workbookSheets.has(norm(s.name))) ? 'full' : 'partial';

  const fail = (f: Omit<ValidationFinding, 'id' | 'status'>) => {
    rulesChecked.add(f.ruleId);
    if (findings.length >= MAX_FINDINGS) {
      truncated = true;
      return;
    }
    findings.push({ ...f, id: `${f.ruleId}|${f.sheet}|${f.row ?? 'S'}|${f.field}`, status: statusFor(f.severity) });
  };
  const pass = (ruleId: string, category: ValidationCategory, sheet: string, field: string, expected: string, severity: Severity) => {
    rulesChecked.add(ruleId);
    const p = passed.get(ruleId);
    if (p) p.passedCount++;
    else passed.set(ruleId, { ruleId, category, sheet, field, expected, passedCount: 1, severity });
  };

  const bySheet: EngineResult['bySheet'] = [];
  const rowSnapshots: RowSnapshot[] = [];
  let rowsChecked = 0;
  const sheetsValidated: string[] = [];

  for (const sheetSpec of req.sheets) {
    const sheet = workbookSheets.get(norm(sheetSpec.name));
    const structureRule = `${req.code.replace('SPEC-', '')}-S-${sheetSpec.name.replace(/\s+/g, '')}`;
    if (!sheet) {
      if (sheetSpec.required) {
        fail({ ruleId: structureRule, category: 'required_structure', sheet: sheetSpec.name, row: null, field: '(worksheet)', actual: 'Worksheet not found', expected: `Worksheet "${sheetSpec.name}" present`, message: `Required worksheet "${sheetSpec.name}" is missing from the workbook.`, severity: 'critical' });
      }
      continue;
    }
    if (!inScope(sheetSpec.name)) continue;
    pass(structureRule, 'required_structure', sheetSpec.name, '(worksheet)', `Worksheet "${sheetSpec.name}" present`, 'critical');
    sheetsValidated.push(sheet.name);

    const colIndex = new Map(sheet.headers.map((h, i) => [norm(String(h ?? '')), i]));
    const specs = req.columns.filter((c) => c.sheet === sheetSpec.name);
    const present: { spec: ColumnSpec; idx: number }[] = [];
    for (const spec of specs) {
      const idx = colIndex.get(norm(spec.header));
      if (idx === undefined) {
        fail({ ruleId: `${spec.ruleId}.COL`, category: 'required_structure', sheet: sheet.name, row: null, field: spec.header, actual: 'Column not found', expected: `Column "${spec.header}"`, message: `Required column "${spec.header}" is missing.`, severity: spec.required ? 'critical' : 'minor' });
      } else {
        pass(`${spec.ruleId}.COL`, 'required_structure', sheet.name, spec.header, `Column "${spec.header}"`, 'critical');
        present.push({ spec, idx });
      }
    }

    const seen = new Map<string, Map<string, number>>();
    const cross = req.crossRules.filter((x) => x.sheet === sheetSpec.name);
    const before = findings.length;
    let sheetRows = 0;

    sheet.rows.forEach((row, i) => {
      if (row.every((c) => isEmpty(c))) return;
      const excelRow = i + 2; // header occupies row 1
      sheetRows++;
      for (const { spec, idx } of present) {
        const v = row[idx];
        const base = { sheet: sheet.name, row: excelRow, field: spec.header, severity: spec.severity };
        if (isEmpty(v)) {
          if (spec.required) {
            const category: ValidationCategory = spec.unique || spec.severity === 'critical' ? 'required_field' : 'missing_value';
            fail({ ...base, ruleId: `${spec.ruleId}.REQ`, category, actual: '(empty)', expected: 'Value required', message: `${spec.header} is mandatory but empty.` });
          }
          continue;
        }
        if (spec.required) pass(`${spec.ruleId}.REQ`, spec.unique || spec.severity === 'critical' ? 'required_field' : 'missing_value', sheet.name, spec.header, 'Value required', spec.severity);

        if (spec.type === 'number') {
          const n = toNumber(v);
          if (n === null) {
            fail({ ...base, ruleId: `${spec.ruleId}.TYPE`, category: 'data_type', actual: display(v), expected: 'Numeric value', message: `${spec.header} must be numeric.` });
            continue;
          }
          pass(`${spec.ruleId}.TYPE`, 'data_type', sheet.name, spec.header, 'Numeric value', spec.severity);
          if (spec.min !== undefined || spec.max !== undefined) {
            const expected = `${spec.min ?? '−∞'} – ${spec.max ?? '∞'}`;
            if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
              fail({ ...base, ruleId: `${spec.ruleId}.RANGE`, category: 'range', actual: display(v), expected, message: `${spec.header} ${n} is outside the permitted range ${expected}.` });
            } else pass(`${spec.ruleId}.RANGE`, 'range', sheet.name, spec.header, expected, spec.severity);
          }
        } else if (spec.type === 'date') {
          if (toDate(v) === null) {
            fail({ ...base, ruleId: `${spec.ruleId}.TYPE`, category: 'data_type', actual: display(v), expected: 'Date YYYY-MM-DD', message: `${spec.header} is not a valid ISO date.` });
            continue;
          }
          pass(`${spec.ruleId}.TYPE`, 'data_type', sheet.name, spec.header, 'Date YYYY-MM-DD', spec.severity);
        } else if (spec.type === 'enum' && spec.allowed) {
          const category: ValidationCategory = spec.isUnit ? 'unit' : 'allowed_value';
          const expected = spec.allowed.join(' | ');
          if (!enumMatches(v, spec.allowed)) {
            fail({ ...base, ruleId: `${spec.ruleId}.${spec.isUnit ? 'UOM' : 'ENUM'}`, category, actual: display(v), expected, message: spec.isUnit ? `Unit "${display(v)}" does not follow the approved standard (${expected}).` : `"${display(v)}" is not an allowed value for ${spec.header}.` });
          } else pass(`${spec.ruleId}.${spec.isUnit ? 'UOM' : 'ENUM'}`, category, sheet.name, spec.header, expected, spec.severity);
        } else if (spec.pattern) {
          const ok = new RegExp(spec.pattern).test(String(v).trim().slice(0, MAX_CELL_CHARS));
          if (!ok) fail({ ...base, ruleId: `${spec.ruleId}.FMT`, category: 'data_type', actual: display(v), expected: spec.patternHint ?? spec.pattern, message: `${spec.header} does not match the required format.` });
          else pass(`${spec.ruleId}.FMT`, 'data_type', sheet.name, spec.header, spec.patternHint ?? spec.pattern, spec.severity);
        }

        if (spec.unique) {
          const key = String(v).trim();
          const map = seen.get(spec.header) ?? new Map<string, number>();
          seen.set(spec.header, map);
          const first = map.get(key);
          if (first !== undefined) {
            fail({ ...base, ruleId: `${spec.ruleId}.UNQ`, category: 'duplicate', actual: display(v), expected: 'Unique value', message: `Duplicate ${spec.header} — first used in row ${first}.` });
          } else {
            map.set(key, excelRow);
            pass(`${spec.ruleId}.UNQ`, 'duplicate', sheet.name, spec.header, 'Unique value', spec.severity);
          }
        }
      }

      for (const x of cross) {
        const li = colIndex.get(norm(x.left));
        const ri = colIndex.get(norm(x.right));
        if (li === undefined || ri === undefined) continue;
        const parse = (c: Cell) => toNumber(c) ?? toDate(c);
        const l = parse(row[li]);
        const r = parse(row[ri]);
        if (l === null || r === null) continue; // already reported as type/required failures
        const ok = x.op === '<=' ? l <= r : x.op === '<' ? l < r : x.op === '>=' ? l >= r : l > r;
        const field = `${x.left} vs ${x.right}`;
        if (!ok) {
          fail({ ruleId: x.ruleId, category: 'cross_field', sheet: sheet.name, row: excelRow, field, actual: `${display(row[li])} ${x.op} ${display(row[ri])} is false`, expected: `${x.left} ${x.op} ${x.right}`, message: x.description, severity: x.severity });
        } else pass(x.ruleId, 'cross_field', sheet.name, field, `${x.left} ${x.op} ${x.right}`, x.severity);
      }
    });

    rowsChecked += sheetRows;
    const sheetFindings = findings.slice(before);
    const flaggedRows = [...new Set(sheetFindings.filter((f) => f.row !== null).map((f) => f.row as number))];
    for (const r of flaggedRows) {
      if (rowSnapshots.length >= MAX_ROW_SNAPSHOTS) break;
      const cells = sheet.rows[r - 2] ?? [];
      rowSnapshots.push({ sheet: sheet.name, row: r, values: Object.fromEntries(sheet.headers.map((h, i) => [String(h), display(cells[i])])) });
    }
    const failRows = new Set(sheetFindings.filter((f) => f.status === 'failed' && f.row !== null).map((f) => f.row));
    bySheet.push({
      sheet: sheet.name,
      rows: sheetRows,
      failed: sheetFindings.filter((f) => f.status === 'failed').length,
      warnings: sheetFindings.filter((f) => f.status === 'warning').length,
      failingRows: failRows.size,
    });
  }

  const failed = findings.filter((f) => f.status === 'failed');
  const warnings = findings.filter((f) => f.status === 'warning');
  const passedChecks = [...passed.values()].reduce((a, p) => a + p.passedCount, 0);
  const rowKey = (f: ValidationFinding) => `${f.sheet}#${f.row}`;
  const failingRowKeys = new Set(failed.filter((f) => f.row !== null).map(rowKey));
  const warningRowKeys = new Set(warnings.filter((f) => f.row !== null && !failingRowKeys.has(rowKey(f))).map(rowKey));

  const categories: ValidationCategory[] = ['required_structure', 'required_field', 'missing_value', 'data_type', 'allowed_value', 'range', 'duplicate', 'cross_field', 'unit'];
  const byCategory = categories.map((category) => ({
    category,
    passed: [...passed.values()].filter((p) => p.category === category).reduce((a, p) => a + p.passedCount, 0),
    failed: failed.filter((f) => f.category === category).length,
    warnings: warnings.filter((f) => f.category === category).length,
  }));

  const overall: OverallValidation = failed.length > 0 ? 'failed' : warnings.length > 0 ? 'passed_with_warnings' : 'passed';

  return {
    scope,
    sheetsValidated,
    overall,
    findings,
    passedRules: [...passed.values()],
    rowSnapshots,
    bySheet,
    byCategory,
    truncated,
    totals: {
      rowsChecked,
      rulesChecked: rulesChecked.size,
      checksPerformed: passedChecks + failed.length + warnings.length,
      passedChecks,
      failedChecks: failed.length,
      warningChecks: warnings.length,
      criticalFailures: failed.filter((f) => f.severity === 'critical').length,
      failingRows: failingRowKeys.size,
      warningRows: warningRowKeys.size,
    },
  };
}

/** Pre-validation structure analysis used by the chatbot and upload preview. */
export function analyseStructure(req: RequirementDocument, wb: ParsedWorkbook) {
  const names = new Map(wb.sheets.map((s) => [norm(s.name), s]));
  const missingSheets = req.sheets.filter((s) => !names.has(norm(s.name))).map((s) => ({ name: s.name, required: s.required }));
  const missingColumns: { sheet: string; column: string; required: boolean }[] = [];
  for (const c of req.columns) {
    const s = names.get(norm(c.sheet));
    if (!s) continue;
    if (!s.headers.some((h) => norm(String(h ?? '')) === norm(c.header))) missingColumns.push({ sheet: c.sheet, column: c.header, required: c.required });
  }
  const extraSheets = wb.sheets.filter((s) => !req.sheets.some((r) => norm(r.name) === norm(s.name))).map((s) => s.name);
  return {
    sheetCount: wb.sheets.length,
    columnCount: wb.sheets.reduce((a, s) => a + s.headers.length, 0),
    rowCount: wb.sheets.reduce((a, s) => a + s.rows.length, 0),
    missingSheets,
    missingColumns,
    extraSheets,
  };
}

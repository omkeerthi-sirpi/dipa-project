// Defensive client-side Excel parsing for PREVIEW purposes.
// The backend must repeat every check (and malware-scan the file) — client-side
// validation can be bypassed and is never trusted for security decisions.

import { config } from '@/lib/config';
import type { ParsedWorkbook, WorkbookMeta } from '@/types';

export class UploadError extends Error {}

const ALLOWED_EXT = ['.xlsx', '.xls'];
const ALLOWED_MIME = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream', ''];
const MAX_CELL_CHARS = 256;

export interface ParseResult {
  workbook: ParsedWorkbook;
  meta: WorkbookMeta;
  warnings: string[];
}

/** Display-safe file name: no path segments or control characters, bounded length. */
export function safeDisplayName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? 'workbook';
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 120);
}

function hasSignature(bytes: Uint8Array, ext: string) {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const cfb = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b);
  return ext === '.xlsx' ? zip : cfb;
}

export function checkFileBasics(file: File): string {
  const lower = file.name.toLowerCase();
  const ext = ALLOWED_EXT.find((e) => lower.endsWith(e));
  if (!ext) throw new UploadError('Unsupported file type. Only .xlsx and .xls workbooks are accepted (macro-enabled .xlsm files are not allowed).');
  if (!ALLOWED_MIME.includes(file.type)) throw new UploadError(`Unexpected file type “${file.type}”. Upload an Excel workbook.`);
  if (file.size === 0) throw new UploadError('The selected file is empty.');
  if (file.size > config.maxUploadBytes) throw new UploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The maximum size is ${config.maxUploadBytes / 1024 / 1024} MB.`);
  return ext;
}

function normaliseCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, MAX_CELL_CHARS);
}

export async function parseWorkbookFile(file: File): Promise<ParseResult> {
  const ext = checkFileBasics(file);
  const buffer = await file.arrayBuffer();
  if (!hasSignature(new Uint8Array(buffer.slice(0, 8)), ext)) {
    throw new UploadError('File content does not match its extension. The file may be corrupted or renamed.');
  }
  const XLSX = await import('xlsx');
  let wb: import('xlsx').WorkBook;
  try {
    // cellFormula is read only to COUNT formulas; values come from cached results. Nothing is executed.
    wb = XLSX.read(buffer, { type: 'array', cellFormula: true, cellHTML: false, cellDates: true, bookVBA: true, sheetRows: config.maxRowsPerSheet + 1 });
  } catch {
    throw new UploadError('The workbook could not be read. It may be corrupted, password-protected or not a valid Excel file.');
  }
  if ((wb as { vbaraw?: unknown }).vbaraw) throw new UploadError('Workbooks containing macros (VBA) are not accepted.');
  if (!wb.SheetNames.length) throw new UploadError('The workbook contains no worksheets.');
  if (wb.SheetNames.length > config.maxSheets) throw new UploadError(`Too many worksheets (${wb.SheetNames.length}). Maximum is ${config.maxSheets}.`);

  const warnings: string[] = [];
  let formulaCellCount = 0;
  let externalRefs = 0;
  const sheets: ParsedWorkbook['sheets'] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      const cell = ws[key] as { f?: string };
      if (cell?.f) {
        formulaCellCount++;
        if (cell.f.includes('[')) externalRefs++;
      }
    }
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    if (!aoa.length) continue;
    const headers = (aoa[0] ?? []).map((h) => String(normaliseCell(h) ?? '')).slice(0, config.maxColumnsPerSheet + 1);
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    if (headers.length > config.maxColumnsPerSheet) throw new UploadError(`Worksheet “${name}” has more than ${config.maxColumnsPerSheet} columns.`);
    const rows = aoa.slice(1).map((r) => headers.map((_, i) => normaliseCell(r[i])));
    if (aoa.length - 1 >= config.maxRowsPerSheet) warnings.push(`Worksheet “${name}” was truncated to ${config.maxRowsPerSheet.toLocaleString()} rows.`);
    sheets.push({ name: safeDisplayName(name).slice(0, 60), headers, rows: rows.filter((r) => r.some((c) => c !== null)) });
  }
  if (!sheets.length || sheets.every((s) => s.rows.length === 0)) throw new UploadError('The workbook does not contain any data rows.');
  if (formulaCellCount) warnings.push(`${formulaCellCount} formula cell(s) detected — cached values are used and formulas are never evaluated.`);
  if (externalRefs) warnings.push(`${externalRefs} formula(s) reference external workbooks. External links are ignored.`);

  return {
    workbook: { sheets, formulaCellCount },
    warnings,
    meta: {
      fileName: safeDisplayName(file.name),
      fileSize: file.size,
      sheets: sheets.map((s) => ({ name: s.name, columns: s.headers, rowCount: s.rows.length })),
      formulaCellCount,
      synthetic: false,
    },
  };
}

/** Write a synthetic sample workbook so demo users can try the full upload flow. */
export async function downloadSampleWorkbook(type: import('@/types').DocumentType, profile: 'dirty' | 'clean', fileName: string) {
  const [{ generateSampleWorkbook }, XLSX] = await Promise.all([import('@/mocks/sampleWorkbooks'), import('xlsx')]);
  const sample = generateSampleWorkbook(type, profile, 11);
  const wb = XLSX.utils.book_new();
  for (const s of sample.sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]), s.name);
  XLSX.writeFile(wb, fileName);
}

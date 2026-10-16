import { describe, expect, it } from 'vitest';
import { requirements } from '@/mocks/data/reference';
import { generateSampleWorkbook } from '@/mocks/sampleWorkbooks';
import type { DocumentType } from '@/types';
import { analyseStructure, toDate, validateWorkbook } from './engine';

const types: DocumentType[] = ['equipment_data_sheet', 'pipeline_inspection', 'pressure_vessel_spec', 'instrumentation_data', 'maintenance_records'];
const reqFor = (t: DocumentType) => requirements.find((r) => r.documentType === t)!;

describe('validation engine', () => {
  it.each(types)('clean synthetic %s workbook passes with zero findings', (t) => {
    const res = validateWorkbook(reqFor(t), generateSampleWorkbook(t, 'clean'));
    expect(res.findings).toEqual([]);
    expect(res.overall).toBe('passed');
    expect(res.scope).toBe('full');
  });

  it.each(types)('warnings profile for %s produces warnings only', (t) => {
    const res = validateWorkbook(reqFor(t), generateSampleWorkbook(t, 'warnings'));
    expect(res.totals.failedChecks).toBe(0);
    expect(res.totals.warningChecks).toBeGreaterThan(0);
    expect(res.overall).toBe('passed_with_warnings');
  });

  it.each(types)('major profile for %s fails without critical failures', (t) => {
    const res = validateWorkbook(reqFor(t), generateSampleWorkbook(t, 'major'));
    expect(res.overall).toBe('failed');
    expect(res.totals.criticalFailures).toBe(0);
  });

  it.each(types)('dirty profile for %s has critical failures', (t) => {
    const res = validateWorkbook(reqFor(t), generateSampleWorkbook(t, 'dirty'));
    expect(res.totals.criticalFailures).toBeGreaterThan(0);
  });

  it('counts unique failing rows separately from field-level failures', () => {
    const req = reqFor('equipment_data_sheet');
    const wb = generateSampleWorkbook('equipment_data_sheet', 'clean');
    const design = wb.sheets.find((s) => s.name === 'Design Data')!;
    const h = (name: string) => design.headers.indexOf(name);
    // Two failures on the same row.
    design.rows[0][h('Pressure Unit')] = 'psig';
    design.rows[0][h('Temperature Unit')] = 'F';
    const res = validateWorkbook(req, wb);
    expect(res.totals.failedChecks).toBe(2);
    expect(res.totals.failingRows).toBe(1);
    expect(res.findings.every((f) => f.row === 2)).toBe(true);
  });

  it('detects missing worksheets and columns', () => {
    const req = reqFor('pressure_vessel_spec');
    const wb = generateSampleWorkbook('pressure_vessel_spec', 'clean');
    wb.sheets = wb.sheets.filter((s) => s.name !== 'Material Certificates');
    wb.sheets[0].headers[wb.sheets[0].headers.indexOf('MAWP Unit')] = 'Pressure Units';
    const res = validateWorkbook(req, wb);
    expect(res.findings.some((f) => f.category === 'required_structure' && f.field === '(worksheet)')).toBe(true);
    expect(res.findings.some((f) => f.category === 'required_structure' && f.field === 'MAWP Unit')).toBe(true);
    const a = analyseStructure(req, wb);
    expect(a.missingSheets.map((s) => s.name)).toEqual(['Material Certificates']);
  });

  it('marks scope partial when a required sheet is excluded', () => {
    const req = reqFor('equipment_data_sheet');
    const res = validateWorkbook(req, generateSampleWorkbook('equipment_data_sheet', 'clean'), ['Design Data']);
    expect(res.scope).toBe('partial');
    expect(res.sheetsValidated).toEqual(['Design Data']);
  });

  it('parses ISO dates strictly', () => {
    expect(toDate('2026-02-28')).not.toBeNull();
    expect(toDate('2026-02-30')).toBeNull();
    expect(toDate('31/06/2026')).toBeNull();
  });
});

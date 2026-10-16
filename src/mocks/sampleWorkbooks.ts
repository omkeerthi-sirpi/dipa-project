// MOCK DATA — synthetic workbook generator.
// Produces realistic-looking but entirely fictional engineering rows for each
// document type, optionally seeded with deliberate defects so the validation
// engine has something meaningful to find.

import type { DocumentType, ParsedWorkbook } from '@/types';
import { requirements } from './data/reference';

export type SampleProfile = 'clean' | 'warnings' | 'major' | 'dirty';

type Cell = string | number | null;
type Level = 'minor' | 'major' | 'critical';
interface Defect {
  sheet: string;
  row: number; // 0-based data row index
  header: string;
  value: Cell;
  level: Level;
}

/** Deterministic PRNG (mulberry32) so seeded data is stable across reloads. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const isoDay = (base: Date, offsetDays: number) => {
  const d = new Date(base.getTime() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
};

function headersFor(type: DocumentType, sheet: string) {
  const req = requirements.find((r) => r.documentType === type)!;
  return req.columns.filter((c) => c.sheet === sheet).map((c) => c.header);
}

function build(type: DocumentType, sheets: Record<string, Record<string, Cell>[]>, defects: Defect[], profile: SampleProfile): ParsedWorkbook {
  const allowed: Record<SampleProfile, Level[]> = {
    clean: [],
    warnings: ['minor'],
    major: ['minor', 'major'],
    dirty: ['minor', 'major', 'critical'],
  };
  for (const d of defects) {
    if (!allowed[profile].includes(d.level)) continue;
    const row = sheets[d.sheet]?.[d.row];
    if (row) row[d.header] = d.value;
  }
  return {
    formulaCellCount: 0,
    sheets: Object.entries(sheets).map(([name, rows]) => {
      const headers = headersFor(type, name);
      return { name, headers, rows: rows.map((r) => headers.map((h) => r[h] ?? null)) };
    }),
  };
}

function equipmentDataSheet(rand: () => number, profile: SampleProfile): ParsedWorkbook {
  const classes = [
    { p: 'V', cls: 'Pressure Vessel', code: 'ASME VIII Div 1', desc: ['HP Production Separator', 'Test Separator', 'Fuel Gas Scrubber', 'Flare KO Drum'] },
    { p: 'E', cls: 'Heat Exchanger', code: 'TEMA R', desc: ['Gas/Gas Exchanger', 'Crude Cooler', 'Glycol Reboiler'] },
    { p: 'P', cls: 'Centrifugal Pump', code: 'API 610', desc: ['Crude Transfer Pump', 'Produced Water Pump', 'Condensate Booster Pump'] },
    { p: 'K', cls: 'Compressor', code: 'API 617', desc: ['Export Gas Compressor', 'Flash Gas Compressor'] },
  ];
  const materials = ['CS SA-516-70', 'SS316L', 'Duplex SS 2205', 'CS SA-106-B'];
  const services = ['Hydrocarbon gas', 'Stabilised crude', 'Produced water', 'Fuel gas', 'Lean glycol'];
  const register: Record<string, Cell>[] = [];
  const design: Record<string, Cell>[] = [];
  const nozzles: Record<string, Cell>[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const c = classes[i % classes.length];
    const id = `${c.p}-${2100 + i * 7}${c.p === 'P' ? 'A' : ''}`;
    register.push({
      'Equipment ID': id,
      Description: c.desc[i % c.desc.length],
      'Equipment Class': c.cls,
      Service: services[i % services.length],
      'Material of Construction': materials[Math.floor(rand() * materials.length)],
      'Design Code': c.code,
    });
    const dp = r1(15 + rand() * 105);
    const dt = Math.round(80 + rand() * 170);
    design.push({
      'Equipment ID': id,
      'Design Pressure': dp,
      'Operating Pressure': r1(dp * (0.68 + rand() * 0.2)),
      'Pressure Unit': 'barg',
      'Design Temperature': dt,
      'Operating Temperature': dt - Math.round(15 + rand() * 40),
      'Temperature Unit': '°C',
      'Corrosion Allowance (mm)': [1.5, 3, 3, 6][i % 4],
    });
    for (let k = 1; k <= 2; k++) {
      nozzles.push({
        'Equipment ID': id,
        'Nozzle Mark': `N${k}`,
        'Nominal Size (in)': [2, 3, 4, 6, 8, 10, 12][Math.floor(rand() * 7)],
        'Flange Rating': ['150#', '300#', '600#', '900#'][Math.floor(rand() * 4)],
        Facing: dp > 90 ? 'RTJ' : 'RF',
      });
    }
  }
  const defects: Defect[] = [
    { sheet: 'Equipment Register', row: 3, header: 'Equipment ID', value: null, level: 'critical' },
    { sheet: 'Equipment Register', row: 6, header: 'Equipment ID', value: register[2]['Equipment ID'], level: 'critical' },
    { sheet: 'Equipment Register', row: 8, header: 'Material of Construction', value: 'Carbon Steel', level: 'major' },
    { sheet: 'Equipment Register', row: 10, header: 'Service', value: null, level: 'minor' },
    { sheet: 'Design Data', row: 4, header: 'Operating Pressure', value: r1((design[4]['Design Pressure'] as number) + 6.5), level: 'critical' },
    { sheet: 'Design Data', row: 7, header: 'Pressure Unit', value: 'psig', level: 'major' },
    { sheet: 'Design Data', row: 9, header: 'Design Temperature', value: 520, level: 'major' },
    { sheet: 'Design Data', row: 2, header: 'Corrosion Allowance (mm)', value: 'three', level: 'minor' },
    { sheet: 'Nozzle Schedule', row: 5, header: 'Facing', value: 'Raised Face', level: 'minor' },
    { sheet: 'Nozzle Schedule', row: 11, header: 'Flange Rating', value: '400#', level: 'major' },
  ];
  return build('equipment_data_sheet', { 'Equipment Register': register, 'Design Data': design, 'Nozzle Schedule': nozzles }, defects, profile);
}

function pipelineInspection(rand: () => number, profile: SampleProfile): ParsedWorkbook {
  const segments: Record<string, Cell>[] = [];
  const anomalies: Record<string, Cell>[] = [];
  let kp = 0;
  for (let i = 0; i < 10; i++) {
    const len = r1(3 + rand() * 2.5);
    segments.push({
      'Segment ID': `PL-01-S${pad(i + 1, 3)}`,
      'Start KP': r1(kp),
      'End KP': r1(kp + len),
      'Nominal WT': [15.9, 17.5, 19.1, 20.6][i % 4],
      'WT Unit': 'mm',
      MAOP: 132,
      'MAOP Unit': 'barg',
      'Coating Type': i < 2 ? 'CTE' : '3LPE',
    });
    kp += len;
  }
  const types = ['Metal Loss', 'Metal Loss', 'Metal Loss', 'Dent', 'Girth Weld Anomaly', 'Lamination'];
  const base = new Date('2026-06-12T00:00:00Z');
  for (let i = 0; i < 16; i++) {
    const s = segments[Math.floor((i / 16) * segments.length)];
    const start = s['Start KP'] as number;
    anomalies.push({
      'Anomaly ID': `A-${pad(10231 + i * 13, 5)}`,
      'Segment ID': s['Segment ID'],
      KP: r1(start + rand() * 2),
      'Anomaly Type': types[Math.floor(rand() * types.length)],
      'Depth (%WT)': Math.round(8 + rand() * 32),
      'Length (mm)': Math.round(20 + rand() * 180),
      Orientation: `${pad(Math.floor(rand() * 12), 2)}:${pad(Math.floor(rand() * 4) * 15, 2)}`,
      'Inspection Date': isoDay(base, Math.floor(i / 6)),
    });
  }
  const defects: Defect[] = [
    { sheet: 'ILI Anomalies', row: 4, header: 'Depth (%WT)', value: 112, level: 'critical' },
    { sheet: 'ILI Anomalies', row: 9, header: 'Anomaly ID', value: anomalies[8]['Anomaly ID'], level: 'critical' },
    { sheet: 'ILI Anomalies', row: 12, header: 'Anomaly Type', value: 'Corrosion', level: 'major' },
    { sheet: 'ILI Anomalies', row: 6, header: 'Orientation', value: '14 o’clock', level: 'minor' },
    { sheet: 'ILI Anomalies', row: 14, header: 'Inspection Date', value: '31/06/2026', level: 'major' },
    { sheet: 'Segment Data', row: 5, header: 'WT Unit', value: 'in', level: 'major' },
    { sheet: 'Segment Data', row: 7, header: 'End KP', value: segments[7]['Start KP'], level: 'major' },
    { sheet: 'Segment Data', row: 3, header: 'Coating Type', value: 'Polyethylene', level: 'minor' },
  ];
  return build('pipeline_inspection', { 'Segment Data': segments, 'ILI Anomalies': anomalies }, defects, profile);
}

function pressureVessel(rand: () => number, profile: SampleProfile): ParsedWorkbook {
  const vessels: Record<string, Cell>[] = [];
  const certs: Record<string, Cell>[] = [];
  const tags = ['V-1001', 'V-1002', 'V-2101', 'V-2102', 'V-3301', 'V-4410', 'V-8801', 'V-8802'];
  tags.forEach((tag, i) => {
    const mawp = r1(10 + rand() * 140);
    vessels.push({
      'Vessel Tag': tag,
      Orientation: i % 3 === 0 ? 'Horizontal' : 'Vertical',
      MAWP: mawp,
      'MAWP Unit': 'barg',
      'Hydrotest Pressure': r1(mawp * 1.3),
      'Shell Thickness (mm)': Math.round(12 + mawp / 3),
      'Joint Efficiency': i % 2 ? '0.85' : '1.00',
      'PWHT Required': mawp > 60 ? 'Yes' : 'No',
    });
    ['Shell', 'Head'].forEach((component, k) => {
      certs.push({
        'Vessel Tag': tag,
        Component: component,
        'Material Spec': 'SA-516-70N',
        'Heat Number': `H${pad(418200 + i * 17 + k * 3, 6)}`,
        'Certificate Type': mawp > 100 ? 'EN 10204 3.2' : 'EN 10204 3.1',
      });
    });
  });
  const defects: Defect[] = [
    { sheet: 'Vessel Data', row: 2, header: 'Hydrotest Pressure', value: r1((vessels[2].MAWP as number) * 0.9), level: 'critical' },
    { sheet: 'Vessel Data', row: 5, header: 'MAWP Unit', value: 'psig', level: 'major' },
    { sheet: 'Vessel Data', row: 6, header: 'Joint Efficiency', value: '0.90', level: 'major' },
    { sheet: 'Vessel Data', row: 4, header: 'Orientation', value: 'Vert.', level: 'minor' },
    { sheet: 'Material Certificates', row: 7, header: 'Heat Number', value: certs[6]['Heat Number'], level: 'major' },
    { sheet: 'Material Certificates', row: 10, header: 'Certificate Type', value: 'EN 10204 2.2', level: 'major' },
    { sheet: 'Material Certificates', row: 12, header: 'Vessel Tag', value: null, level: 'critical' },
  ];
  return build('pressure_vessel_spec', { 'Vessel Data': vessels, 'Material Certificates': certs }, defects, profile);
}

function instrumentation(rand: () => number, profile: SampleProfile): ParsedWorkbook {
  const index: Record<string, Cell>[] = [];
  const cal: Record<string, Cell>[] = [];
  const kinds = [
    { p: 'PT', t: 'Pressure Transmitter', u: 'barg', min: 0, max: 160 },
    { p: 'TT', t: 'Temperature Transmitter', u: '°C', min: -20, max: 250 },
    { p: 'LT', t: 'Level Transmitter', u: '%', min: 0, max: 100 },
    { p: 'FT', t: 'Flow Transmitter', u: 'm3/h', min: 0, max: 800 },
  ];
  const base = new Date('2026-02-01T00:00:00Z');
  for (let i = 0; i < 14; i++) {
    const k = kinds[i % kinds.length];
    const tag = `${k.p}-${2201 + i * 3}`;
    index.push({
      'Tag Number': tag,
      'Instrument Type': k.t,
      'P&ID Number': `2200-PID-${pad(11 + (i % 6), 3)}`,
      'Range Min': k.min,
      'Range Max': k.max,
      'Engineering Unit': k.u,
      'SIL Rating': i % 5 === 0 ? 'SIL 2' : i % 3 === 0 ? 'SIL 1' : 'None',
      'Hazardous Area': i % 4 === 0 ? 'Zone 1' : 'Zone 2',
    });
    const offset = Math.floor(rand() * 120);
    cal.push({
      'Tag Number': tag,
      'Calibration Date': isoDay(base, offset),
      'Next Due Date': isoDay(base, offset + 365),
      'As-Found Error (%)': r1(rand() * 0.4),
      Technician: ['R. Mensah', 'K. Duffy', 'A. Novak', 'S. Tran'][i % 4],
    });
  }
  const defects: Defect[] = [
    { sheet: 'Instrument Index', row: 3, header: 'Range Max', value: -10, level: 'critical' },
    { sheet: 'Instrument Index', row: 8, header: 'Tag Number', value: index[5]['Tag Number'], level: 'critical' },
    { sheet: 'Instrument Index', row: 6, header: 'SIL Rating', value: 'SIL 4', level: 'major' },
    { sheet: 'Instrument Index', row: 10, header: 'Engineering Unit', value: 'psi', level: 'major' },
    { sheet: 'Calibration', row: 2, header: 'As-Found Error (%)', value: 0.9, level: 'minor' },
    { sheet: 'Calibration', row: 7, header: 'Next Due Date', value: cal[7]['Calibration Date'], level: 'major' },
    { sheet: 'Calibration', row: 11, header: 'Technician', value: null, level: 'minor' },
  ];
  return build('instrumentation_data', { 'Instrument Index': index, Calibration: cal }, defects, profile);
}

function maintenance(rand: () => number, profile: SampleProfile): ParsedWorkbook {
  const wos: Record<string, Cell>[] = [];
  const parts: Record<string, Cell>[] = [];
  const equipment = ['P-5201A', 'P-5201B', 'K-4101', 'V-2101', 'E-3102', 'P-1201A'];
  const types = ['Preventive', 'Preventive', 'Corrective', 'Predictive', 'Shutdown'];
  const base = new Date('2026-04-01T00:00:00Z');
  for (let i = 0; i < 15; i++) {
    const start = Math.floor(rand() * 140);
    const wo = `WO-${pad(4012300 + i * 41, 7)}`;
    wos.push({
      'Work Order No': wo,
      'Equipment ID': equipment[i % equipment.length],
      'Maintenance Type': types[Math.floor(rand() * types.length)],
      Priority: ['P2', 'P3', 'P3', 'P4', 'P1'][i % 5],
      'Start Date': isoDay(base, start),
      'Completion Date': isoDay(base, start + 1 + Math.floor(rand() * 4)),
      'Labour Hours': Math.round(4 + rand() * 60),
      Status: i > 12 ? 'In Progress' : 'Completed',
    });
    if (i % 2 === 0) {
      parts.push({ 'Work Order No': wo, 'Part Number': `SP-${pad(210400 + i * 7, 6)}`, Quantity: 1 + Math.floor(rand() * 6), UoM: i % 4 ? 'EA' : 'SET' });
    }
  }
  const defects: Defect[] = [
    { sheet: 'Work Orders', row: 5, header: 'Work Order No', value: wos[4]['Work Order No'], level: 'critical' },
    { sheet: 'Work Orders', row: 8, header: 'Completion Date', value: isoDay(base, -3), level: 'major' },
    { sheet: 'Work Orders', row: 10, header: 'Maintenance Type', value: 'Breakdown', level: 'major' },
    { sheet: 'Work Orders', row: 3, header: 'Labour Hours', value: 'approx 12', level: 'minor' },
    { sheet: 'Spare Parts', row: 2, header: 'UoM', value: 'PCS', level: 'minor' },
    { sheet: 'Spare Parts', row: 4, header: 'Quantity', value: 0, level: 'major' },
  ];
  return build('maintenance_records', { 'Work Orders': wos, 'Spare Parts': parts }, defects, profile);
}

const generators: Record<DocumentType, (rand: () => number, profile: SampleProfile) => ParsedWorkbook> = {
  equipment_data_sheet: equipmentDataSheet,
  pipeline_inspection: pipelineInspection,
  pressure_vessel_spec: pressureVessel,
  instrumentation_data: instrumentation,
  maintenance_records: maintenance,
};

export function generateSampleWorkbook(type: DocumentType, profile: SampleProfile, seed = 7): ParsedWorkbook {
  return generators[type](rng(seed), profile);
}

// MOCK DATA — seed script.
// Builds a consistent demo dataset by replaying real workflow operations with
// simulated timestamps, so every seeded document has a coherent history,
// validation reports and audit trail.

import type { DocumentType, User, WorkbookMeta } from '@/types';
import { type DbState, emptyDb } from './db';
import { projects, users, vendors } from './data/reference';
import * as ops from './ops';
import { generateSampleWorkbook, hashSeed, rng, type SampleProfile } from './sampleWorkbooks';

type Step =
  | ['validate']
  | ['manual', 'progress' | 'pass' | 'fail']
  | ['submit', string]
  | ['approve', string, string]
  | ['reject', string, string]
  | ['version', SampleProfile, string, string]
  | ['vendor', string];

interface SeedDoc {
  title: string;
  projectId: string;
  assetId: string;
  type: DocumentType;
  owner: string;
  revision: string;
  profile: SampleProfile;
  daysAgo: number;
  steps: Step[];
}

const APPROVE_OK = 'Reviewed validation report and manual test record. Data consistent with IFC datasheets.';

const seedDocs: SeedDoc[] = [
  // ---- Priya Raman (demo engineer) ----
  { title: 'HP Production Separator Equipment Data Sheet', projectId: 'p-nsa', assetId: 'a-v2101', type: 'equipment_data_sheet', owner: 'u-eng-1', revision: 'Rev A', profile: 'clean', daysAgo: 9, steps: [['validate'], ['manual', 'pass'], ['submit', 'All automated checks passed. Spot-checked 3 of 12 tags against vendor GA drawings.']] },
  { title: 'Export Gas Compressor Data Sheet', projectId: 'p-nsa', assetId: 'a-k4101', type: 'equipment_data_sheet', owner: 'u-eng-1', revision: 'Rev 0', profile: 'dirty', daysAgo: 3, steps: [['validate']] },
  { title: 'Crude Transfer Pumps Data Sheet', projectId: 'p-nsa', assetId: 'a-p1201', type: 'equipment_data_sheet', owner: 'u-eng-1', revision: 'Rev A', profile: 'warnings', daysAgo: 14, steps: [['validate'], ['manual', 'pass'], ['submit', 'Minor facing/service warnings noted; values confirmed with process.'], ['reject', 'u-mgr-1', 'Nozzle N2 flange ratings on P-1201A do not match the latest API 610 datasheet (Rev 3). Please align with vendor data and resubmit.']] },
  { title: 'Alpha Platform Instrument Index & Calibration', projectId: 'p-nsa', assetId: 'a-ins-nsa', type: 'instrumentation_data', owner: 'u-eng-1', revision: 'Rev A', profile: 'major', daysAgo: 1, steps: [] },
  { title: 'HP Separator V-2101 Pressure Vessel Specification', projectId: 'p-nsa', assetId: 'a-v2101', type: 'pressure_vessel_spec', owner: 'u-eng-1', revision: 'Rev A', profile: 'dirty', daysAgo: 40, steps: [['validate'], ['version', 'clean', 'Rev B', 'Corrected hydrotest pressure for V-2102 and duplicate heat numbers.'], ['validate'], ['manual', 'pass'], ['submit', 'Rev B addresses all Rev A findings.'], ['approve', 'u-mgr-2', APPROVE_OK], ['vendor', 'v-ald']] },
  { title: 'Inlet Slug Catcher V-1001 Pressure Vessel Specification', projectId: 'p-kgd', assetId: 'a-v1001', type: 'pressure_vessel_spec', owner: 'u-eng-1', revision: 'Rev 0', profile: 'warnings', daysAgo: 4, steps: [['validate']] },
  { title: 'Kestrel Gas Plant Maintenance History Q3', projectId: 'p-kgd', assetId: 'a-e3102', type: 'maintenance_records', owner: 'u-eng-1', revision: 'Rev 0', profile: 'clean', daysAgo: 6, steps: [['validate'], ['manual', 'progress']] },
  { title: 'Sable Ridge KP0–KP42 ILI Anomaly Listing', projectId: 'p-srx', assetId: 'a-pl01', type: 'pipeline_inspection', owner: 'u-eng-1', revision: 'Rev A', profile: 'clean', daysAgo: 21, steps: [['validate'], ['manual', 'pass'], ['submit', 'ILI run June 2026 — data verified against Corvane preliminary report.'], ['approve', 'u-mgr-1', 'Approved. Proceed with fitness-for-service assessment package.']] },
  { title: 'Trident Topsides Instrument Calibration Records', projectId: 'p-trp', assetId: 'a-ins-trp', type: 'instrumentation_data', owner: 'u-eng-1', revision: 'Rev 0', profile: 'clean', daysAgo: 5, steps: [['validate'], ['manual', 'pass']] },

  // ---- Daniel Okafor ----
  { title: 'Cargo Offloading Pumps Data Sheet', projectId: 'p-trp', assetId: 'a-p3301', type: 'equipment_data_sheet', owner: 'u-eng-2', revision: 'Rev B', profile: 'clean', daysAgo: 7, steps: [['validate'], ['manual', 'pass'], ['submit', 'Updated for impeller change-out (MOC-2291).']] },
  { title: 'Water Injection Pumps Maintenance History', projectId: 'p-trp', assetId: 'a-p5201', type: 'maintenance_records', owner: 'u-eng-2', revision: 'Rev 0', profile: 'warnings', daysAgo: 33, steps: [['validate'], ['manual', 'pass'], ['submit', 'Two minor UoM warnings accepted (legacy CMMS codes).'], ['approve', 'u-mgr-1', APPROVE_OK], ['vendor', 'v-nrt']] },
  { title: 'Trident Topsides Instrument Index', projectId: 'p-trp', assetId: 'a-ins-trp', type: 'instrumentation_data', owner: 'u-eng-2', revision: 'Rev 0', profile: 'dirty', daysAgo: 2, steps: [['validate']] },
  { title: 'Mixed Refrigerant Compressor Data Sheet', projectId: 'p-hlng', assetId: 'a-k6101', type: 'equipment_data_sheet', owner: 'u-eng-2', revision: 'Rev A', profile: 'warnings', daysAgo: 18, steps: [['validate'], ['manual', 'pass'], ['submit', 'First issue for vendor bid clarification.'], ['reject', 'u-mgr-2', 'Design temperature for K-6101 suction drum must reflect the −46 °C MDMT case. Update and resubmit.'], ['version', 'clean', 'Rev B', 'MDMT case incorporated per review comment.'], ['validate'], ['manual', 'pass'], ['submit', 'Rev B incorporates manager comments.']] },

  // ---- Sofia Lindqvist ----
  { title: 'Sable Ridge Segment Design Basis', projectId: 'p-srx', assetId: 'a-pl01', type: 'pipeline_inspection', owner: 'u-eng-3', revision: 'Rev A', profile: 'major', daysAgo: 8, steps: [['validate'], ['manual', 'pass'], ['submit', 'Deviation requested for legacy WT unit entries on S006 (as-built records in inches).']] },
  { title: 'Main Cryogenic Heat Exchanger Vessel Specification', projectId: 'p-hlng', assetId: 'a-e6201', type: 'pressure_vessel_spec', owner: 'u-eng-3', revision: 'Rev C', profile: 'clean', daysAgo: 45, steps: [['validate'], ['manual', 'pass'], ['submit', 'Issued for fabrication.'], ['approve', 'u-mgr-2', APPROVE_OK], ['vendor', 'v-ald']] },
  { title: 'Pig Receiver V-8801 Pressure Vessel Specification', projectId: 'p-srx', assetId: 'a-v8801', type: 'pressure_vessel_spec', owner: 'u-eng-3', revision: 'Rev 0', profile: 'clean', daysAgo: 4, steps: [['validate'], ['manual', 'progress']] },
  { title: 'Kestrel Gas Plant Instrument Index', projectId: 'p-kgd', assetId: 'a-ins-kgd', type: 'instrumentation_data', owner: 'u-eng-3', revision: 'Rev B', profile: 'clean', daysAgo: 26, steps: [['validate'], ['manual', 'pass'], ['submit', 'Loop check results incorporated.'], ['approve', 'u-mgr-1', APPROVE_OK]] },

  // ---- Marcus Hale ----
  { title: 'Alpha Platform Rotating Equipment Maintenance History', projectId: 'p-nsa', assetId: 'a-k4101', type: 'maintenance_records', owner: 'u-eng-4', revision: 'Rev 0', profile: 'clean', daysAgo: 52, steps: [['validate'], ['manual', 'pass'], ['submit', 'Annual reliability review dataset.'], ['approve', 'u-mgr-1', APPROVE_OK], ['vendor', 'v-nrt']] },
  { title: 'LNG Storage Tank T-501 Data Sheet', projectId: 'p-hlng', assetId: 'a-t501', type: 'equipment_data_sheet', owner: 'u-eng-4', revision: 'Rev 0', profile: 'warnings', daysAgo: 1, steps: [] },
  { title: 'Intra-field Flowline PL-07 ILI Data', projectId: 'p-kgd', assetId: 'a-kgd-pl', type: 'pipeline_inspection', owner: 'u-eng-4', revision: 'Rev 0', profile: 'dirty', daysAgo: 5, steps: [['validate']] },
  { title: 'Firewater Pumps Data Sheet', projectId: 'p-nsa', assetId: 'a-p7101', type: 'equipment_data_sheet', owner: 'u-eng-4', revision: 'Rev A', profile: 'clean', daysAgo: 6, steps: [['validate'], ['manual', 'pass'], ['submit', 'Updated driver rating per NFPA 20 review.']] },
  { title: 'Train 2 Instrument Calibration Records', projectId: 'p-hlng', assetId: 'a-ins-hlng', type: 'instrumentation_data', owner: 'u-eng-4', revision: 'Rev A', profile: 'warnings', daysAgo: 12, steps: [['validate'], ['manual', 'pass'], ['submit', 'Calibration campaign Sept 2026.'], ['reject', 'u-mgr-1', 'As-found errors above 0.5 % on TT-2204 need a recalibration record before acceptance.']] },
];

export function workbookMeta(type: DocumentType, profile: SampleProfile, fileName: string, seed: number): WorkbookMeta {
  const wb = generateSampleWorkbook(type, profile, seed);
  return {
    fileName,
    fileSize: 18_000 + Math.round(wb.sheets.reduce((a, s) => a + s.rows.length * s.headers.length, 0) * 41),
    sheets: wb.sheets.map((s) => ({ name: s.name, columns: s.headers, rowCount: s.rows.length })),
    formulaCellCount: 0,
    synthetic: true,
    sampleProfile: profile,
  };
}

const userById = (id: string) => users.find((u) => u.id === id) as User;

export function seedDatabase(): DbState {
  const s = emptyDb();
  const now = Date.now();
  const rand = rng(20261015);

  const ordered = [...seedDocs].sort((a, b) => b.daysAgo - a.daysAgo);
  for (const sd of ordered) {
    const owner = userById(sd.owner);
    let t = now - sd.daysAgo * 86400000 - Math.round(rand() * 6 * 3600000);
    const tick = (minH: number, maxH: number) => {
      const span = Math.min(maxH, Math.max(minH, (now - t) / 3600000 / (sd.steps.length + 1)));
      t = Math.min(now - 600000, t + Math.round((minH + rand() * (span - minH)) * 3600000));
      return new Date(t);
    };
    const project = projects.find((p) => p.id === sd.projectId)!;
    const asset = project.assets.find((a) => a.id === sd.assetId)!;
    const fileName = `${asset.tag.replace(/[^A-Za-z0-9-]/g, '_')}_${sd.type.split('_')[0]}_${sd.revision.replace(/\s/g, '')}.xlsx`;
    const doc = ops.createDocument(s, owner, { title: sd.title, projectId: sd.projectId, assetId: sd.assetId, type: sd.type, revision: sd.revision, changeNote: 'Initial issue', file: workbookMeta(sd.type, sd.profile, fileName, hashSeed(sd.title)) }, null, new Date(t));

    for (const step of sd.steps) {
      const at = tick(1, 30);
      switch (step[0]) {
        case 'validate':
          ops.runValidation(s, owner, doc.id, {}, at);
          break;
        case 'manual': {
          const mode = step[1];
          const isFirst = doc.currentVersion === 1;
          const report = ops.latestReport(s, doc);
          const needsDeviation = !!report && report.totals.failedChecks > 0;
          ops.saveManualTest(
            s,
            owner,
            doc.id,
            {
              testerName: owner.name,
              testDate: at.toISOString().slice(0, 10),
              items: ['MT-01', 'MT-02', 'MT-03', 'MT-04', 'MT-05', 'MT-06', 'MT-07'].map((id, i) => ({
                id,
                result: mode === 'progress' && i > 2 ? null : id === 'MT-04' && isFirst ? 'na' : id === 'MT-07' ? 'na' : 'pass',
                comment: id === 'MT-04' && isFirst ? 'First issue — no prior corrections.' : id === 'MT-01' ? 'Sampled 10 % of rows against controlled source.' : '',
              })),
              observations: mode === 'progress' ? '' : 'No discrepancies found during manual verification.',
              evidence: mode === 'progress' ? [] : [{ name: `${doc.docNumber}_spotcheck.pdf`, size: 284_311 }],
              deviation: needsDeviation ? { acknowledged: true, justification: 'Legacy as-built values retained pending field verification; risk assessed as low by discipline lead.' } : undefined,
              complete: mode !== 'progress',
            },
            at,
          );
          break;
        }
        case 'submit':
          ops.submitForApproval(s, owner, doc.id, { comment: step[1] }, at);
          break;
        case 'approve':
          ops.decide(s, userById(step[1]), doc.id, { decision: 'approved', comment: step[2], versionNo: doc.currentVersion }, tick(4, 40));
          break;
        case 'reject':
          ops.decide(s, userById(step[1]), doc.id, { decision: 'changes_requested', comment: step[2], versionNo: doc.currentVersion }, tick(4, 40));
          break;
        case 'version': {
          const [, profile, revision, note] = step;
          const name = fileName.replace(sd.revision.replace(/\s/g, ''), revision.replace(/\s/g, ''));
          ops.uploadVersion(s, owner, doc.id, { revision, changeNote: note, file: workbookMeta(sd.type, profile, name, hashSeed(sd.title + revision)) }, null, at);
          break;
        }
        case 'vendor': {
          const v = vendors.find((x) => x.id === step[1])!;
          ops.vendorSubmit(s, userById('u-mgr-1'), doc.id, { versionNo: doc.currentVersion, vendorId: v.id, contactName: v.contactName, contactEmail: v.contactEmail, notes: 'Issued for construction / vendor action.', packageItems: ['Approved document', 'Validation report', 'Manual testing record', 'Approval certificate'] }, tick(2, 30));
          break;
        }
      }
    }
  }
  // Seeded notifications start as read except the most recent few.
  s.notifications.forEach((n, i) => (n.read = i > 4));
  s.audit.sort((a, b) => b.at.localeCompare(a.at));
  return s;
}

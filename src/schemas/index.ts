// Zod schemas for client-side form validation. These improve UX only —
// the backend must validate every payload with its own schemas.
import { z } from 'zod';

const trimmed = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `Maximum ${max} characters.`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(1, 'Password is required.').max(200),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const documentDetailsSchema = z.object({
  projectId: z.string().min(1, 'Select a project.'),
  assetId: z.string().min(1, 'Select an asset.'),
  type: z.enum(['equipment_data_sheet', 'pipeline_inspection', 'pressure_vessel_spec', 'instrumentation_data', 'maintenance_records'], { message: 'Select a document type.' }),
  title: trimmed(5, 160, 'Title must be at least 5 characters.'),
  revision: z
    .string()
    .trim()
    .regex(/^Rev [A-Z0-9]{1,3}$/, 'Use the format “Rev A”, “Rev B” or “Rev 0”.'),
  changeNote: z.string().trim().max(500, 'Maximum 500 characters.'),
});
export type DocumentDetailsValues = z.infer<typeof documentDetailsSchema>;

export const newVersionSchema = documentDetailsSchema.pick({ revision: true }).extend({
  changeNote: trimmed(5, 500, 'Describe what changed in this revision (min. 5 characters).'),
});

export const manualTestSchema = z
  .object({
    testerName: trimmed(2, 120, 'Tester name is required.'),
    testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a test date.'),
    items: z.array(
      z.object({
        id: z.string(),
        required: z.boolean(),
        result: z.enum(['pass', 'fail', 'na']).nullable(),
        comment: z.string().max(1000, 'Maximum 1000 characters.'),
      }),
    ),
    observations: z.string().max(4000, 'Maximum 4000 characters.'),
    deviationAcknowledged: z.boolean(),
    deviationJustification: z.string().max(2000),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((i, idx) => {
      if (i.result === 'fail' && !i.comment.trim()) ctx.addIssue({ code: 'custom', path: ['items', idx, 'comment'], message: 'Describe the failure.' });
      if (i.required && i.result === 'na' && !i.comment.trim()) ctx.addIssue({ code: 'custom', path: ['items', idx, 'comment'], message: 'Justify N/A for a mandatory test.' });
    });
  });
export type ManualTestValues = z.infer<typeof manualTestSchema>;

export const submitSchema = z.object({ comment: z.string().trim().max(2000, 'Maximum 2000 characters.') });

export const approveSchema = z.object({
  comment: z.string().trim().max(2000, 'Maximum 2000 characters.'),
  confirm: z.literal(true, { message: 'Confirm that you reviewed the report and test record.' }),
});
export const rejectSchema = z.object({ comment: trimmed(10, 2000, 'Provide a rejection reason of at least 10 characters.') });

export const vendorSchema = z.object({
  vendorId: z.string().min(1, 'Select a vendor.'),
  contactName: trimmed(2, 120, 'Contact name is required.'),
  contactEmail: z.string().trim().email('Enter a valid email.').max(200),
  notes: z.string().max(2000),
  packageItems: z.array(z.string()).min(1, 'Select at least one package item.'),
  confirm: z.literal(true, { message: 'Confirm the transmittal package is complete.' }),
});
export type VendorValues = z.infer<typeof vendorSchema>;

# DIPA — Document Integrity & Process Approval (prototype)

Interactive prototype of an engineering document validation and approval platform for oil & gas projects.
Engineers upload Excel workbooks, validate them against controlled requirement specifications through a guided
(scripted) chatbot, perform manual testing and submit for approval. Managers review, approve or request changes,
and release approved documents to vendors.

> **Prototype.** Authentication, the backend, validation runs, approvals and vendor submission are simulated
> in the browser with synthetic data. Nothing here is production-ready security. See [SECURITY.md](SECURITY.md).

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) and build to `dist/` |
| `npm run preview` | Serve the production build (with CSP and security headers) on :4173 |
| `npm test` | Run unit/integration tests (Vitest) |
| `npm run typecheck` | Type-check only |

Requires Node 20+ (developed on Node 24).

## Demo accounts

Use the persona buttons on the sign-in page, or type an email (mock auth accepts **any non-empty password**):

| Persona | Email | Name |
| --- | --- | --- |
| Engineer Demo | `engineer.demo@meridian-energy.example` | Priya Raman — Senior Mechanical Engineer |
| Manager Demo | `manager.demo@meridian-energy.example` | Elena Vasquez — Engineering Manager |

Switch personas or **Reset demo data** from the profile menu (top right).

## Suggested demo script

1. **Engineer** → *Upload Document* → choose project/asset/type → on step 2 click **Sample with seeded errors**, then upload
   the downloaded file. Preview sheets/columns, confirm the requirement document (step 3) and upload.
2. **Start validation chatbot** → follow the quick replies. Ask free-text questions such as
   “What is the allowed range for design pressure?” or try “approve this document” (the assistant refuses).
3. Open the **detailed report** — filter by status, worksheet, field, severity; click the eye icon to see the row with failing fields highlighted; export to Excel or PDF (print).
4. Critical failures block manual testing. Use **Fix & upload new version** with the **Corrected sample**, rerun validation, then complete **Manual testing** and **Submit for manager approval**.
5. **Switch to Manager** → *Approval Queue* → open the document. Approve is enabled only after opening the
   *Validation report* and *Manual testing* tabs. Request changes (reason required) or approve.
6. If changes were requested, switch back to the engineer, correct/re-validate/re-test and resubmit.
7. After approval the manager completes **Vendor handover** (simulated transmittal). Dashboards, badges, audit
   history and notifications update immediately.

## Architecture

```
src/
  components/      Reusable UI (shadcn-style primitives in ui/, status badges, tables, timeline, stepper)
  features/
    validation/    Deterministic rule engine, report summary, findings table, Excel export
    workflow/      State machine, permission rules, submission gating, dashboard stage groups
    chatbot/       Scripted assistant (intent matching; no AI model)
    upload/        Defensive SheetJS parsing + sample template generator
    charts/        Recharts dashboard charts
  hooks/           TanStack Query hooks (queries + mutations with cache invalidation)
  layouts/         App shell with role-specific navigation
  lib/             Query client, config, labels, utilities
  mocks/           MOCK BACKEND: router, workflow operations, seed data, synthetic workbooks
  pages/           Route pages (engineer/, manager/, shared)
  routes/          Router + auth/role guards
  schemas/         Zod form schemas
  services/        Typed API client + service functions (single entry point to the API)
  types/           Shared domain models / API contracts
```

- **Data flow:** pages → TanStack Query hooks → `services/` → `apiClient`. With `VITE_USE_MOCKS=true` (default) the client
  routes requests to the in-browser mock server (`src/mocks/server.ts`), which enforces authentication, role, ownership,
  project membership, workflow transitions and version checks, returning 401/403/404/409/422 like a real API.
  Set `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL` to call a real backend (`fetch` with `credentials: 'include'` and a CSRF header).
- **Workflow:** Draft → Uploaded → Validation In Progress → Validation Failed/Passed → Manual Testing → Ready for Manager Review
  → Pending Manager Approval → Changes Requested | Manager Approved → Vendor Submission Ready → Vendor Submitted.
  Validation, manual-testing, approval and vendor statuses are tracked separately. New revisions keep all prior reports,
  manual test records, comments and approvals.
- **Validation engine:** deterministic checks for required worksheets/columns, required fields, empty values, data type/format,
  allowed values, min/max ranges, duplicates, cross-field rules and units. Every finding carries requirement code/version,
  rule id, worksheet, Excel row and field. Field-level check counts and **unique failing rows** are reported separately.

## Stack

Vite 8 · React 19 · TypeScript 7 · Tailwind CSS 4 · TanStack Query 5 · React Router 8 · React Hook Form + Zod 4 ·
shadcn-style components on Radix UI · Recharts 3 · SheetJS 0.20.3 (official CDN build — the npm `xlsx` package is outdated
and has known vulnerabilities) · Lucide · Sonner · Vitest.

## Mocked vs real

| Area | Prototype behaviour |
| --- | --- |
| Authentication | Mock: demo user id stored in localStorage; any password accepted for the two demo accounts |
| Backend/API | Mock server in the browser; workflow metadata persisted to localStorage (`dipa.mockdb.v1`) |
| Excel parsing | **Real** (SheetJS, client-side, for preview); workbook cells kept in memory only — lost on refresh |
| Validation | **Real deterministic rules** executed in the mock backend; seeded documents use synthetic datasets |
| Chatbot | Scripted state machine + keyword intents. **No AI model** |
| Reports export | Excel (real, with formula-injection guard); PDF via browser print dialog |
| Evidence attachments | Placeholder — only file name/size recorded |
| Notifications, approvals, vendor submission | Simulated; no email or external integration |

## Recommended next steps

1. Build the backend API matching `src/services/index.ts` (e.g. Node/NestJS or .NET) with PostgreSQL; port
   `features/workflow/workflow.ts` and `features/validation/engine.ts` server-side as the source of truth.
2. Integrate the corporate IdP (OIDC/SAML) with server sessions in HttpOnly cookies + CSRF protection.
3. Private object storage for workbooks with malware scanning, server-side parsing limits and signed, permission-checked downloads.
4. Append-only audit store; requirement documents managed as versioned, approved artefacts.
5. Optional AI assistance (explanations, fix suggestions) layered **on top of** deterministic results, restricted to authorised
   documents, with prompt-injection defences and no authority over workflow transitions.
6. Real e-mail/transmittal integration with the vendor document control system.

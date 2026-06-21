# Phase 4 — Plan (GitHub Issues)

This plan contains 6 self-contained, agent-ready issues to implement the multi-patient architecture, caregiver-patient association management, and scoped event routing for Glance.

## Dependency order

- Issue 1 (database schema and migration) must land first.
- Issue 2 (scoped APIs) and Issue 3 (linking/registration APIs) depend on Issue 1.
- Issue 4 (dashboard route restructuring) depends on Issue 2 and Issue 3.
- Issue 5 (sidebar and client status UI) depends on Issue 4.
- Issue 6 (room-based WebSocket alert routing) can proceed after Issue 4 is in place.

```
1 (schema & migration)
├── 2 (scoped messages & config APIs)
└── 3 (patient link & register APIs)
    └── 4 (dashboard route restructuring)
        ├── 5 (sidebar switcher, status, & name editor)
        └── 6 (room-based WebSocket alert routing)
```

---

## Issue 1: Database Schema Updates & Migrations

- **Goal**: Extend the database schema to support patient labeling and caregiver associations, generate migrations, and verify the schema constraints with unit tests.
- **Context**: Currently, family members are not explicitly linked to patients. We must add a display name to the `patients` table and create a new `patient_caregivers` join table.
- **Relevant Files**:
  - [schema.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/db/schema.ts)
  - [schema.test.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/__tests__/schema.test.ts)
- **Proposed Approach**:
  1. In `packages/shared/db/schema.ts`, add the `name` column to the `patients` table with a default of `'New Patient'`.
  2. Create the `patientCaregivers` table mapping `patientId` (references `patients.id`) and `familyMemberId` (references `family_members.id`) with cascade deletes. Include a check constraint enforcing `role IN ('primary_caregiver', 'caregiver')` and a unique constraint on `(patientId, familyMemberId)`.
  3. Export typescript types: `Patient`, `PatientCaregiver`, `NewPatientCaregiver`.
  4. Run `pnpm db:generate` to output the migration file under `packages/shared/drizzle/migrations/`.
  5. Apply the migration using `pnpm db:migrate` on the local database.
  6. Add unit tests in `schema.test.ts` to verify constraints (attempting to link the same patient-caregiver twice fails; invalid roles fail; deleting a patient deletes association records).
- **Acceptance Criteria**:
  - Migration script successfully generated and applied.
  - Unit tests run and pass.
  - Build passes in the monorepo (`pnpm build`).
- **Verify**:
  - Run `pnpm --filter @glance/shared test` to execute the database tests.
  - Run `pnpm build` in the root.

---

## Issue 2: Scoped Messaging & Camera-Configuration APIs

- **Goal**: Update existing message and camera-config endpoints to require authorization verification against the `patient_caregivers` table.
- **Context**: Currently, any family member can query all messages or change any patient's camera schedules. We must scope these APIs to ensure caregivers can only manage their associated patients.
- **Relevant Files**:
  - [route.ts](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/api/messages/route.ts)
  - [camera-config/route.ts](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/api/patients/%5Bid%5D/camera-config/route.ts)
- **Proposed Approach**:
  1. In `GET /api/messages`, extract the `patientId` query parameter. Verify that the logged-in family member is associated with this `patientId` in the `patientCaregivers` table. Return `403 Forbidden` if not associated.
  2. In `POST /api/messages`, extract `recipientId` (the target patient) from the request body. Verify caregiver association. Return `403` if not associated.
  3. In `GET` and `POST` routes of `/api/patients/[id]/camera-config`, extract `id` from the URL params. Verify that the logged-in family member has a matching `patient_caregivers` record for `patientId = id`. Return `403` if not associated.
  4. Ensure patient-side token-based endpoints (e.g. `POST /api/patients/[id]/sos`, `POST /api/messages/patient`) are unaffected but update their queries that notify caregivers to scan `patient_caregivers` instead of the messages history table.
- **Acceptance Criteria**:
  - All modified routes return `403 Forbidden` if the caregiver is not associated with the patient.
  - Authorized calls return the correct database records (200/201).
- **Verify**:
  - Test via Postman or `curl`: log in as a caregiver, attempt to POST message or change config for an unassociated patient ID, verify it receives a `403`.
  - Perform authorized calls, verify they succeed.

---

## Issue 3: Patient Registration & Linking APIs

- **Goal**: Implement APIs to retrieve associated patients, register new patients, and link to existing patient devices.
- **Context**: Caregivers must be able to onboard new patients and link to existing patients securely.
- **Relevant Files**:
  - `apps/dashboard/src/app/api/patients/route.ts` (Existing)
  - `apps/dashboard/src/app/api/patients/link/route.ts` (**NEW**)
  - `apps/dashboard/src/app/api/patients/register/route.ts` (**NEW**)
- **Proposed Approach**:
  1. In `GET /api/patients`, update the query to return only patients associated with the logged-in family member via `patientCaregivers` join query.
  2. Create `/api/patients/register` API. Request body: `{ name: string }`. Inside, insert a new `patients` row with a random `deviceToken` and the requested name. Insert a `patientCaregivers` link with `role: 'primary_caregiver'`. Return the created patient's `id`, `deviceToken`, and a configuration link.
  3. Create `/api/patients/link` API. Request body: `{ deviceToken: string }`. Inside, look up the patient by device token. If found, create a `patientCaregivers` link with `role: 'caregiver'`. Return the patient record.
- **Acceptance Criteria**:
  - `GET /api/patients` returns the list of associated patients only.
  - `/api/patients/register` returns `201` and provisions a new patient securely linked to the caller.
  - `/api/patients/link` returns `200` and links the caller to an existing patient device.
- **Verify**:
  - Query `GET /api/patients` and verify it contains only associated patients.
  - Verify linking returns `401`/`404` for invalid device tokens and links correctly for valid ones.

---

## Issue 4: Caregiver Dashboard Restructuring & URL Scoping

- **Goal**: Restructure dashboard routes and layouts to use dynamic URL scoping `/patients/[id]`.
- **Context**: Currently, dashboard is statically mounted at `/` and hardcodes patient configuration. Dynamic URL-scoping ensures cleaner routing and state management.
- **Relevant Files**:
  - `apps/dashboard/src/app/page.tsx` (Current landing page)
  - `apps/dashboard/src/app/patients/[id]/page.tsx` (**NEW**)
  - [middleware.ts](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/middleware.ts)
- **Proposed Approach**:
  1. Create a dynamic Next.js page at `apps/dashboard/src/app/patients/[id]/page.tsx`.
  2. Move the core dashboard panels (compose message, messages history, settings, camera schedules config) from `page.tsx` into `/patients/[id]/page.tsx`.
  3. Change `/` (`page.tsx`) to perform a checks: fetch patients from `GET /api/patients`. If the caregiver has patients, redirect to `/patients/[firstPatientId]` immediately. If they have none, show a welcoming dashboard empty-state prompting them to register or link a patient.
  4. Update `middleware.ts` to allow `/patients/*` routes under the session authentication check.
- **Acceptance Criteria**:
  - Navigating to `/` redirects to the active patient dashboard or empty state.
  - Selecting a patient URL `/patients/[id]` loads that patient's specific messages, composer, schedules, and configurations.
- **Verify**:
  - Log in, navigate to `/`, verify it redirects to `/patients/<uuid>`.
  - Verify that manually changing the URL parameter changes the active patient context.

---

## Issue 5: Sidebar Switcher, Connection Status & Name Editor UI

- **Goal**: Add a sidebar patient list with online/offline connection indicators, a patient name editor, and registration/linking modals.
- **Context**: A multi-patient system requires a high-quality interface for switching patients, renaming them, and reviewing device connectivity states.
- **Relevant Files**:
  - `apps/dashboard/src/app/patients/[id]/page.tsx`
  - `apps/dashboard/src/app/layout.tsx` (or dashboard container layout)
- **Proposed Approach**:
  1. Add a shared Layout or a Sidebar component inside `apps/dashboard/src/app/layout.tsx` that renders a sidebar on the left side of the dashboard workspace.
  2. Populate the sidebar with:
    - Caregiver profile details and sign-out button.
    - A list of associated patients (fetched via `GET /api/patients`). Clicking a patient navigates to `/patients/[id]`.
    - A green/gray dot next to each patient name representing their device's online/offline connection status.
    - An "Add Patient" button that opens a registration/linking modal.
  3. Implement the **Add Patient Modal** incorporating tabs/views for "Register Patient" and "Link Device". Hook them up to the backend APIs from Issue 3.
  4. In the active patient header (`[id]/page.tsx`), add a small edit button next to the patient's name. When clicked, it renders a text input allowing caregivers to rename the patient. On save, trigger a PATCH API to update the name in the database.
- **Acceptance Criteria**:
  - Sidebar is fully responsive, showing patient list and connection status indicators.
  - Adding a patient via the modal refreshes the list and redirects.
  - Renaming a patient updates the sidebar list and header immediately.
- **Verify**:
  - Verify sidebar renders correctly on desktop.
  - Rename a patient to "Uncle Bob" and verify the name updates in real-time.
  - Click "Add Patient", register a new patient, verify it redirects.

---

## Issue 6: Room-Based WebSocket Alert Routing

- **Goal**: Implement room subscriptions in the WebSocket server and push real-time alerts to caregivers.
- **Context**: Caregivers must receive alarms (like SOS) in real-time. We must replace the broadcast model with a room subscription model.
- **Relevant Files**:
  - [index.ts](file:///Users/kaikameyama/repos/Glance/apps/ws-server/src/index.ts)
  - `apps/dashboard/src/app/patients/[id]/page.tsx` (socket handler)
  - `packages/shared/ws/types.ts`
- **Proposed Approach**:
  1. Update `ws-server`'s `REGISTER` handler: if the registering client is a caregiver, extract the `patientIds` array from the payload and have the socket join `patient:alerts:<patientId>` for each ID.
  2. Update the dashboard client socket setup: when initializing the socket, fetch the list of associated patients, and pass them under the `patientIds` property in the `REGISTER` message.
  3. Update Next.js endpoints that emit WebSockets (message compose, patient reply, patient SOS): instead of posting individual caregiver socket calls, post a single `x-internal-secret` authenticated payload to `/emit` on `ws-server` specifying `targetPatientId`.
  4. In `ws-server`, route events with `targetPatientId` to `patient:alerts:<targetPatientId>`.
  5. Add patient device socket connectivity broadcasts: when a patient device connects or disconnects, `ws-server` broadcasts a `PATIENT_STATUS_CHANGE` event with their `online`/`offline` status to `patient:alerts:<patientId>`. Dashboard clients catch this event and update the sidebar green/gray dots instantly.
- **Acceptance Criteria**:
  - Caregivers receive messages, replies, and SOS alarms for all their associated patients.
  - Device online/offline dots toggle dynamically as the patient client is closed or opened.
- **Verify**:
  - Connect a patient client. Verify the dashboard sidebar dot immediately turns green. Close the patient client tab, verify the dot turns gray.
  - Trigger SOS on patient client, verify caregivers registered to that patient receive the alarm takeover.

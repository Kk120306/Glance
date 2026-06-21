# Phase 4 — Multi-Patient Architecture & Caregiver Associations Spec

## What

Phase 4 transitions Glance from a single-patient sandbox into a production-ready multi-patient communication network. This includes:
1. **Explicit Caregiver-Patient Associations**: Replaces the loose message-history scanning model with a formal many-to-many relationship table (`patient_caregivers`) governing permissions and mapping family members to patients.
2. **Dynamic URL-Scoped Dashboard (`/patients/[id]`)**: Restructures the caregiver web application. Replaces the hardcoded single-patient query with a sidebar patient switcher, detailed empty-state onboarder at `/`, and fully scoped views for messaging, schedules, and alerts.
3. **Secure Authorization & Scoped APIs**: Enforces permission boundaries at the API level, ensuring caregivers can only view, compose, or configure resources for patients they are explicitly linked to.
4. **Targeted Room-Based WebSockets**: Replaces individual-recipient WebSocket loops with real-time room subscriptions (`patient:alerts:<patientId>`) so caregivers receive instant SOS, message read, and reply alerts for all their associated patients simultaneously.
5. **Patient Registration & Linking Wizards**: Allows caregivers to provision new patients (generating unique setup tokens) or link their accounts to existing patient devices using their unique device tokens.

---

## Requirements

### 1. Database Schema Extensions & Migrations
- **Patient Labeling**: Add a `name` column (text, not null, default `'New Patient'`) to the `patients` table to allow caregivers to easily identify patients in the sidebar and dashboard.
- **Explicit Associations (`patient_caregivers`)**: Create a new join table representing the many-to-many relationship between `family_members` and `patients`.
  - Columns:
    - `id` (uuid PRIMARY KEY, default random)
    - `patientId` (uuid referencing `patients.id` with CASCADE delete, not null)
    - `familyMemberId` (uuid referencing `family_members.id` with CASCADE delete, not null)
    - `role` (text, not null, default `'caregiver'`) — must be `'primary_caregiver'` or `'caregiver'`.
    - `createdAt` (timestamp with timezone, default now, not null)
  - Constraints:
    - Unique constraint on `(patientId, familyMemberId)` to prevent duplicate links.
    - Check constraint enforcing `role` is one of `('primary_caregiver', 'caregiver')`.
- **Migration**: Run `pnpm db:generate` to produce the schema migration and apply it via `pnpm db:migrate`.

### 2. Caregiver Dashboard Scoping & UX
- **Route Layout**:
  - `/` (Home): Lightweight route. Checks if the logged-in caregiver has any associated patients.
    - If yes: Auto-redirects to `/patients/[firstPatientId]`.
    - If no: Renders a beautiful empty-state screen inviting them to either **Register a New Patient** or **Link an Existing Patient**.
  - `/patients/[id]` (Patient Dashboard): The core workspace. Displays the message logs, compose window, and camera schedules specific to the patient matching `[id]`.
- **Sidebar Patient Switcher**:
  - A left sidebar is added to the caregiver dashboard displaying the caregiver's profile and a list of all their associated patients.
  - Active hover state: Highlights the currently selected patient. Clicking another patient navigates to `/patients/[otherId]`.
  - **Connection Status Indicator**: Each patient in the list displays a colored dot reflecting their device status. A green dot indicates the patient's device has an active WebSocket connection online; a gray dot indicates they are offline.
  - **Patient Name Editor**: An inline editing tool or small button next to the active patient's header, allowing primary caregivers to update the patient's display name (updating `patients.name` in the DB).
- **Patient Registration & Pairing Flow**:
  - Renders a modal/panel containing two actions:
    1. **Register New Patient**: Caregiver inputs a name (e.g. "Grandpa"). The server inserts a new `patients` row with a random `deviceToken`, inserts a `patient_caregivers` link, and displays the configuration details: the device token and a clickable setup link (e.g., `https://<patient-app>/?token=<token>`).
    2. **Link Existing Patient**: Caregiver inputs a patient's `deviceToken`. The server finds the matching patient, creates a `patient_caregivers` row, and redirects to that patient's dashboard.

### 3. API Authorization & Scoping
All caregiver-facing API routes must check associations in `patient_caregivers` to prevent unauthorized cross-tenant data leaks:
- **`GET /api/patients`**: Returns only patients associated with the logged-in family member.
- **`GET /api/messages`**: Requires a `patientId` query parameter. Confirms association before returning messages.
- **`POST /api/messages`**: Requires `recipientId` (the patient ID) in the body. Confirms association before persisting.
- **`GET/POST /api/patients/[id]/camera-config`**: Confirms association before reading or writing camera schedules.
- **`POST /api/patients/[id]/sos` (Patient endpoint)**: Keeps its token-based verification. Finds all caregivers linked to the patient via `patient_caregivers` and pushes the socket alert to them.
- **`POST /api/messages/patient` (Patient endpoint)**: Keeps token-based verification. Finds associated caregivers via `patient_caregivers` and notifies them of the phrase board dispatch.

### 4. Real-Time Room-Based WebSockets
- **Decoupled Subscription**: Since `ws-server` has no database access, when a caregiver connects, the dashboard client fetches their list of associated patient IDs and sends them in the socket's `REGISTER` payload:
  ```ts
  {
    type: 'REGISTER',
    role: 'caregiver',
    familyMemberId: '<uuid>',
    patientIds: ['<uuid1>', '<uuid2>']
  }
  ```
- **Room Join**: For each ID in `patientIds`, the `ws-server` adds the caregiver's socket to the room:
  `patient:alerts:<patientId>`
- **Alert Dispatch**:
  - When an SOS, new reply, or patient phrase is POSTed, the Next.js API calls `/emit` on `ws-server` with `targetPatientId: patient.id`.
  - The `ws-server` broadcasts the event to room `patient:alerts:<patientId>`.
  - All online caregivers connected to that patient receive the event in real-time, regardless of which patient dashboard page they are currently browsing.
- **Connection Status API & Broadcast**:
  - The `ws-server` exposes a `GET /api/patients/[id]/status` route (or caregivers query socket states) to let the dashboard check if a patient room has any active connections.
  - When a patient socket joins or leaves room `patient:${patientId}`, `ws-server` emits a status update event (`PATIENT_STATUS_CHANGE`) to `patient:alerts:${patientId}` so caregivers' sidebars update their online/offline green dots dynamically in real-time.

---

## Design

### Database Schema Updates (`packages/shared/db/schema.ts`)

```ts
import { pgTable, uuid, text, boolean, timestamp, integer, check, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// 1. Update patients table to include a display name
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceToken: uuid('device_token').notNull().unique(),
  name: text('name').notNull().default('New Patient'), // Added display name
  cameraOverrideActive: boolean('camera_override_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// 2. New Table: patient_caregivers (Many-to-Many Join)
export const patientCaregivers = pgTable(
  'patient_caregivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    familyMemberId: uuid('family_member_id')
      .notNull()
      .references(() => familyMembers.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('caregiver'), // 'primary_caregiver' | 'caregiver'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Prevent duplicate associations
    unique('unique_patient_caregiver').on(table.patientId, table.familyMemberId),
    // Enforce role values
    check('valid_role', sql`${table.role} IN ('primary_caregiver', 'caregiver')`),
  ]
)
```

### WebSocket Event Extensions (`packages/shared/ws/types.ts`)

```ts
export type ClientToServerMessage =
  | { type: 'REGISTER'; role: 'patient'; patientId: string }
  | {
      type: 'REGISTER'
      role: 'caregiver'
      familyMemberId: string
      patientIds: string[] // Added patientIds array
    }

export type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }
  | { type: 'CAMERA_CONFIG_UPDATE'; payload: { cameraOverrideActive: boolean; schedules: CameraSchedule[] } }
  | { type: 'SOS_TRIGGERED'; payload: { patientId: string; timestamp: string } }
  | { type: 'NEW_REPLY'; payload: { messageId: string; reply: 'yes' | 'no'; repliedAt: string } }
  | { type: 'PATIENT_STATUS_CHANGE'; payload: { patientId: string; status: 'online' | 'offline' } } // Added status change alert
```

---

## Decisions

**Decision #1 — Explicit Join Table vs Message-History Scanning**
- **Choice**: Introduce the `patient_caregivers` table.
- **Why**: Scopes access control and socket message routing securely. The previous hack of scanning message histories is insecure (unlinked caregivers receive no alerts until they message a patient, and any family member can query any message history).
- **Reversibility**: Low. This is a foundational database normalization step.

**Decision #2 — URL-Based Dashboard Scoping (`/patients/[id]`)**
- **Choice**: Use Next.js Dynamic Routing (`apps/dashboard/src/app/patients/[id]/page.tsx`).
- **Why**: Segregates dashboard state cleanly. Scoping by route parameter rather than React state makes dashboards linkable, reload-safe, and aligns with standard multi-tenant dashboard architectures.
- **Reversibility**: Medium. Reverting to state-based switching requires changing the folder structure back to `/` and managing active patient state in a react context.

**Decision #3 — Client-Side Patient Room Registry on REGISTER**
- **Choice**: Send the array of associated `patientIds` from the client inside the socket `REGISTER` event.
- **Why**: Keeps the standalone `ws-server` completely database-independent. It does not need to connect to Postgres or query patient-caregiver links, maintaining the microservice separation established in Phase 1.
- **Reversibility**: High.

**Decision #4 — Add `name` column to `patients` table**
- **Choice**: Store the patient's display name directly on the `patients` table, default to `'New Patient'`.
- **Why**: Enables identifying different patients in the sidebar and main header. In a multi-patient setup, managing UUIDs directly in the UI is not viable.
- **Reversibility**: Low.

---

## Invariants

- **Secure Scoping**: A logged-in caregiver MUST NEVER be able to read message logs, update camera schedules, or view metadata for a patient ID unless a corresponding record exists in `patient_caregivers`.
- **Zero Hands**: Patient-side client remains hands-free. The registration and linking wizards are caregiver-facing and reside solely in the dashboard web application.
- **SOS Independence**: Ambient vocal SOS monitoring on the patient client remains operational, camera-independent, and fully active during multi-patient routing.
- **Single-Patient Bootstrapping Unchanged**: The patient device token bootstrap process (`/?token=<uuid>`) remains identical. The device cookie is pinned to a single patient ID.

---

## Testing Strategy

- **Database Unit Tests** (`packages/shared/__tests__/schema.test.ts`):
  - Verify `patient_caregivers` table constraints (unique link, valid roles).
  - Verify Cascade delete: deleting a patient deletes their caregiver associations.
- **API Integration Tests**:
  - Test `GET /api/messages?patientId=<uuid>`: returns 403 Forbidden if the caregiver is not associated with that patient.
  - Test `POST /api/messages`: returns 403 if the caregiver is not associated with the target recipient patient.
  - Test `POST /api/patients/[id]/camera-config`: returns 403 if caregiver is not associated.
- **WebSocket Room Tests**:
  - Mock connection registrations. Verify caregiver socket joins rooms matching their associated `patientIds`.
  - Emit an SOS event for `patient-A`. Verify only caregivers registered to `patient-A` receive the socket broadcast, and caregivers registered to `patient-B` do not.
  - Verify patient connection status change emits `PATIENT_STATUS_CHANGE` to the correct room.

# Phase 1 — Project Foundation & Message Backbone

## What

Stand up a pnpm monorepo containing two Next.js apps (`patient`, `dashboard`), a standalone WebSocket server (`apps/ws-server`), and a shared package (`packages/shared`). Implement the data layer (Postgres + Drizzle), a one-time device-token bootstrapping flow for the patient, family-member auth (Better Auth), a decoupled WebSocket message channel, and a global design system backed by Tailwind CSS v3.4. A family member can compose and send a text message from the dashboard; the patient sees it appear on their screen in real time. No gaze, no voice, no camera.

## Context

Glance has no code today — only documentation and agent scaffolding. Every later feature (gaze input, voice cloning, CameraWindow scheduling) will bolt on to the communication spine built here. Getting the data model, transport layer, and design tokens right in Phase 1 avoids expensive rewrites later. The patient UI must be usable without hands, so accessibility and high-contrast large-target design are foundational constraints, not afterthoughts.

## Requirements

1. `pnpm` workspace root with `apps/patient`, `apps/dashboard`, `apps/ws-server`, `packages/shared`. Running `pnpm dev` starts all three processes concurrently.
2. Postgres database with Drizzle ORM. Migrations tracked in `packages/shared/drizzle/migrations/`.
3. Schema: `patients`, `family_members`, `messages` tables per the data model below.
4. On startup (after migrations), the server upserts a `patients` row keyed by `PATIENT_DEVICE_TOKEN` env var so the record always exists before the first message is sent.
5. Family members authenticate via email + password using Better Auth. Sessions are JWT-backed, stored in an httpOnly cookie.
6. Patient session is device-pinned via a one-time bootstrapping flow: navigating to `/?token=<uuid>` validates the token, writes a long-lived `x-device-token` httpOnly cookie, and redirects to `/`. Subsequent loads read the cookie — no manual setup required.
7. The WebSocket server runs as a standalone Node process (`apps/ws-server`). The dashboard POSTs to `ws-server/emit` (shared secret `WS_INTERNAL_SECRET`) after persisting a message; `ws-server` broadcasts to the patient room.
8. A family member can POST a message from the dashboard; the patient client receives it via WebSocket within ≤ 1 s under normal network conditions.
9. Dashboard: compose text field + send button; chronological message history list.
10. Patient UI: a one-time "Start Glance" setup splash is shown until the caregiver taps it (resumes `AudioContext`, sets the activation cookie, hides the splash permanently). Thereafter: full-screen message display; permanent SOS button fixed in a corner. Web Audio amplitude-threshold listener fires `console.warn('[SOS] amplitude threshold exceeded')` — no further UI action in Phase 1. (**Hard constraint**: SOS must not require the camera.)
11. Global design system lives in `packages/shared/design/` and is consumed by both apps. See Design System section below.
12. Both apps and `apps/ws-server` pass TypeScript strict-mode type checking with zero errors.
13. Unit tests cover: message schema validation, WebSocket message dispatch, design token exports, and the device-token bootstrapping middleware.

## Design

### Monorepo Layout

```
glance/
├── apps/
│   ├── patient/          # Next.js 15 app (App Router)
│   ├── dashboard/        # Next.js 15 app (App Router)
│   └── ws-server/        # Standalone socket.io Node process
├── packages/
│   └── shared/
│       ├── db/           # Drizzle schema + client + seed
│       ├── drizzle/
│       │   └── migrations/
│       ├── design/       # Design tokens, Tailwind preset, components
│       ├── types/        # Shared TypeScript types
│       └── ws/           # WebSocket message envelope types
├── pnpm-workspace.yaml
├── package.json          # root devDependencies, scripts
└── turbo.json            # Turborepo pipeline
```

### Data Model

```sql
-- patients (one row per deployment)
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
device_token uuid NOT NULL UNIQUE  -- matches PATIENT_DEVICE_TOKEN env var
created_at  timestamptz NOT NULL DEFAULT now()

-- family_members
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
email       text NOT NULL UNIQUE
name        text NOT NULL
password_hash text NOT NULL       -- managed by Better Auth
created_at  timestamptz NOT NULL DEFAULT now()

-- messages
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
sender_id   uuid NOT NULL REFERENCES family_members(id)
recipient_id uuid NOT NULL REFERENCES patients(id)
content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000)
is_yes_no   boolean NOT NULL DEFAULT false
is_read     boolean NOT NULL DEFAULT false
created_at  timestamptz NOT NULL DEFAULT now()
```

### Auth

- **Better Auth** (`better-auth`) on Next.js API routes in `apps/dashboard`.
- Email + password provider only. Magic link deferred.
- Patient auth — bootstrapping flow:
  1. Caregiver navigates to `https://<patient-app>/?token=<PATIENT_DEVICE_TOKEN>` once during device setup.
  2. Next.js middleware intercepts, validates the token against `PATIENT_DEVICE_TOKEN` env var, writes `x-device-token` as an httpOnly, Secure, SameSite=Lax cookie with `Max-Age=315360000` (10 years), then redirects to `/`.
  3. All subsequent patient-app requests read the cookie. Middleware returns 403 if the cookie is absent or mismatched.
  4. No login UI, no manual cookie injection required.

### Real-Time Transport

`apps/ws-server` is a standalone Node.js + socket.io server. It knows nothing about HTTP auth — the dashboard is its only trusted caller.

```
dashboard  --POST /api/messages-->  apps/dashboard API route
                                          │ persist to DB
                                          │ POST /emit  (WS_INTERNAL_SECRET header)
                                          ▼
                                    apps/ws-server
                                          │ socket.io broadcast
                                          ▼
                                    apps/patient (browser)
```

- Protocol: JSON envelopes typed in `packages/shared/ws/`.

```ts
// packages/shared/ws/types.ts
type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }

// Internal HTTP body posted by the dashboard to ws-server
type EmitRequest = {
  room: string          // patient ID
  event: ServerToClientMessage
}
```

- `apps/ws-server` exposes:
  - `POST /emit` — accepts `EmitRequest`, validates `x-internal-secret` header against `WS_INTERNAL_SECRET` env var, broadcasts to `room`. Returns 401 on bad secret, 204 on success.
  - socket.io namespace `/` — clients join a room with their patient ID on connect.
- Patient client connects to `WS_SERVER_URL` (env var). socket.io handles reconnection with exponential backoff.
- No Redis needed in Phase 1 — single ws-server process.

### Database Seeding

After every migration run (`drizzle-kit migrate`), a seed script in `packages/shared/db/seed.ts` upserts the patient record:

```ts
await db.insert(patients)
  .values({ deviceToken: env.PATIENT_DEVICE_TOKEN })
  .onConflictDoNothing()
```

This runs as part of `pnpm db:migrate` in the root package.json so the patient row is guaranteed to exist before any API route executes. No manual seed step.

### Dashboard App (`apps/dashboard`)

- Next.js 15, App Router, TypeScript strict.
- Pages: `/login`, `/` (compose + history).
- `POST /api/messages` — authenticated route, creates a message, then POSTs to `ws-server/emit`.
- `GET /api/messages` — paginated history for the current family member.
- Better Auth mounted at `/api/auth/[...all]`.
- Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `WS_SERVER_URL`, `WS_INTERNAL_SECRET`.

### Patient App (`apps/patient`)

- Next.js 15, App Router, TypeScript strict.
- Route `/` — guarded by middleware (reads `x-device-token` cookie).
- Route `/?token=<uuid>` — bootstrapping path (sets cookie, redirects to `/`).
- On first load after bootstrap (before `AudioContext` has been activated): shows a full-screen "Start Glance" splash with a single large button. Caregiver taps it once. This satisfies the browser user-gesture requirement, resumes `AudioContext`, and sets a `glance-activated` localStorage key. Splash never shows again.
- After activation: full-screen message display. Last received message persists until the next arrives or `MESSAGE_DISPLAY_SECONDS` (default 30) elapses. SOS button fixed bottom-right, min 80×80 px, always visible. Web Audio amplitude listener fires `console.warn('[SOS] amplitude threshold exceeded')`.
- Env vars: `PATIENT_DEVICE_TOKEN`, `WS_SERVER_URL`, `MESSAGE_DISPLAY_SECONDS`.

### Global Design System

Lives at `packages/shared/design/`. Both apps import from `@glance/shared/design`.

#### Color Palette

```ts
// tokens.ts
export const colors = {
  // Brand
  brand: {
    primary:   '#1A56DB',  // accessible blue
    secondary: '#7E3AF2',  // violet accent
  },
  // Neutrals
  neutral: {
    0:   '#FFFFFF',
    50:  '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    700: '#374151',
    900: '#111827',
  },
  // Patient UI — high contrast
  patient: {
    bg:         '#0A0A0A',   // near-black background
    text:       '#F5F5F5',   // near-white text
    accent:     '#22C55E',   // green for confirmations
    sos:        '#EF4444',   // red, always visible
    sosFg:      '#FFFFFF',
    highlight:  '#FACC15',   // yellow scan highlight
  },
  // Semantic
  success: '#16A34A',
  error:   '#DC2626',
  warning: '#D97706',
} as const
```

#### Typography Scale

```ts
export const typography = {
  fontFamily: {
    sans:  '"Inter", system-ui, sans-serif',
    mono:  '"JetBrains Mono", monospace',
    // Patient display — high legibility at large sizes
    display: '"Atkinson Hyperlegible", "Inter", sans-serif',
  },
  fontSize: {
    xs:      '0.75rem',   // 12px
    sm:      '0.875rem',  // 14px
    base:    '1rem',      // 16px
    lg:      '1.125rem',  // 18px
    xl:      '1.25rem',   // 20px
    '2xl':   '1.5rem',    // 24px
    '3xl':   '1.875rem',  // 30px
    '4xl':   '2.25rem',   // 36px
    // Patient-specific
    patient: '3rem',      // 48px — readable from 1 m
    patientLg: '4.5rem',  // 72px — SOS label
  },
  fontWeight: {
    normal:  '400',
    medium:  '500',
    semibold:'600',
    bold:    '700',
  },
  lineHeight: {
    tight:  '1.25',
    normal: '1.5',
    loose:  '1.75',
  },
} as const
```

#### Spacing & Layout Tokens

```ts
export const spacing = {
  // 4-point scale
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
} as const

export const radius = {
  sm:   '0.25rem',
  md:   '0.5rem',
  lg:   '1rem',
  full: '9999px',
} as const

export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
} as const
```

#### Tailwind Integration (v3.4)

Tailwind CSS v3.4 is used (not v4) because v4 deprecates the JS-based preset system in favour of CSS `@theme` directives, which would prevent sharing tokens as TypeScript objects. v3.4 is the current stable LTS-equivalent release.

`packages/shared/design/tailwind-preset.ts` exports a Tailwind v3 preset that maps all tokens into the config. Both apps extend from it:

```ts
// packages/shared/design/tailwind-preset.ts
import { colors, typography, spacing, radius } from './tokens'
import type { Config } from 'tailwindcss'

export const glancePreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand:   colors.brand,
        neutral: colors.neutral,
        patient: colors.patient,
        success: colors.success,
        error:   colors.error,
        warning: colors.warning,
      },
      fontFamily: typography.fontFamily,
      fontSize:   typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      spacing:    spacing,
      borderRadius: radius,
    },
  },
}

// apps/dashboard/tailwind.config.ts
import { glancePreset } from '@glance/shared/design/tailwind-preset'
import type { Config } from 'tailwindcss'
export default {
  presets: [glancePreset],
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config
```

Token values remain importable as TypeScript objects for use in component logic (e.g. `colors.patient.sos` for inline styles on the SOS button).

#### Base Component Primitives (unstyled, accessible)

`packages/shared/design/components/` — built with Radix UI primitives, styled via the token system:

- `Button` — variants: `primary`, `ghost`, `danger`. Min height 44 px (WCAG 2.5.5). Patient variant: 80 px min.
- `Input` — text input with label + error state.
- `MessageBubble` — sender name, content, timestamp.
- `SOSButton` — fixed-position, always `colors.patient.sos`, min 80×80 px, `aria-label="SOS"`.

## Decisions

**Decision #1 — WebSocket server: standalone process**
Choice: `apps/ws-server` as a separate Node.js process. Dashboard calls it over HTTP with a shared secret after persisting a message.
Alternatives considered: (a) embed socket.io in a Next.js custom server — disables Next.js static optimisation and is incompatible with serverless deployments; (b) Vercel Serverless — fundamentally incompatible with persistent WebSocket connections.
Why: keeps both Next.js apps standard and serverless-deployable. The HTTP→ws-server boundary is cheap for Phase 1 throughput. Adding Redis pub/sub later (for horizontal ws-server scaling) is additive, not restructuring.
Reversibility: high — the `EmitRequest` type in `packages/shared/ws/` is the only contract; the transport can change behind it.

**Decision #2 — Tailwind CSS v3.4 (not v4)**
Choice: v3.4.
Why: v4 drops the JS preset system in favour of CSS `@theme` directives, which would prevent sharing token values as TypeScript objects. The JS preset approach is the idiomatic v3 pattern and keeps tokens usable in both Tailwind classes and component logic. Migrate to v4 when its ecosystem stabilises.
Reversibility: medium — v4 migration requires rewriting preset to CSS but tokens remain unchanged.

**Decision #3 — ORM: Drizzle**
Drizzle is schema-first, TypeScript-native, and produces minimal overhead. Prisma generates a client at build time which complicates monorepo caching.
Reversibility: high — migrations are plain SQL.

**Decision #4 — Component foundation: Radix UI + Tailwind**
Unstyled Radix primitives for accessibility semantics (focus, ARIA, keyboard). Tailwind utility classes + the shared preset for styling. No third-party component library that would constrain the patient UI's visual design.
Reversibility: high.

**Decision #5 — Auth: Better Auth**
Better Auth is framework-agnostic, supports email+password natively, and mounts cleanly on Next.js App Router catch-all routes. NextAuth v5 is an alternative but its App Router support is still in beta.
Reversibility: medium (auth sessions are scoped to the dashboard app only).

**Decision #6 — Patient AudioContext: one-time caregiver splash**
Choice: show a full-screen "Start Glance" splash on first load; caregiver taps once to activate.
Why: browser autoplay/microphone policies block `AudioContext` and `getUserMedia` without a user gesture. A programmatic workaround (browser flags, Chrome policy files) ties deployment to a specific browser configuration. The splash is a one-time step, hidden permanently via `localStorage`, and does not appear during normal patient use.
Reversibility: high — remove the splash check once browser policies allow gesture-free audio.

`Assumption:` One patient per deployment for Phase 1. Multi-patient support deferred.

## Versions

| Dependency | Version | Source |
|---|---|---|
| Node.js | 22 LTS | nodejs.org |
| pnpm | 9.x | pnpm.io |
| Next.js | 15.x | nextjs.org |
| TypeScript | 5.x | typescriptlang.org |
| Drizzle ORM | 0.41.x | orm.drizzle.team |
| Better Auth | 1.x | better-auth.com |
| socket.io | 4.x | socket.io |
| Tailwind CSS | 3.4.x | tailwindcss.com |
| Radix UI | 1.x (per primitive) | radix-ui.com |
| Postgres | 16 | postgresql.org |
| Turborepo | 2.x | turbo.build |
| Inter (font) | Google Fonts | fonts.google.com |
| Atkinson Hyperlegible | Google Fonts | fonts.google.com |
| Vitest | 2.x | vitest.dev |

## Invariants

- A `MediaStream` track must never be activated in Phase 1. No `getUserMedia` calls anywhere.
- The Web Audio `AudioContext` is resumed inside the "Start Glance" splash button handler — the only user gesture on the patient device. The listener must be active immediately after that gesture; it must never silently fail to start.
- The "Start Glance" splash is a one-time caregiver step. Once `glance-activated` is set in `localStorage`, it must never be shown again during normal patient use.
- `apps/ws-server POST /emit` must reject any request without a valid `x-internal-secret` header with 401. The secret must never be exposed to the browser client.
- All patient-side interactions after the splash must be operable without a pointer device (keyboard/screen-reader fallback sufficient for Phase 1; gaze comes later).
- `messages.content` length is enforced at both DB level (`CHECK`) and API validation level (Zod). No silent truncation.
- The patient record (`patients` table row) must exist before any message can be inserted. The seed step is part of `pnpm db:migrate` and is not optional.

## Error Behavior

| Scenario | Behavior |
|---|---|
| WebSocket disconnects (patient) | socket.io auto-reconnects with exponential backoff; last displayed message persists |
| `POST /api/messages` with invalid body | 400 + Zod error detail; nothing persisted; ws-server not called |
| `POST /emit` with wrong `WS_INTERNAL_SECRET` | ws-server returns 401; dashboard logs error; message already persisted — client should retry emit |
| ws-server unreachable when dashboard emits | Dashboard logs warning; message is already in DB and will appear on patient next load/reconnect |
| Family member not authenticated | 401; redirect to `/login` |
| Patient `/?token=<uuid>` with wrong token | 403 response; no cookie set; page shows "Invalid setup token" |
| Patient page loaded without cookie | 403; page shows "Device not set up — contact your administrator" |
| DB unreachable | 503 from dashboard API; ws-server unaffected (it has no DB access) |
| `PATIENT_DEVICE_TOKEN` missing at startup | `db:migrate` script exits non-zero with clear error before seeding |

## Testing Strategy

- **Unit** (Vitest): message schema Zod validation, WS envelope type guards, design token exports (spot-check key values), device-token bootstrap middleware (valid token → cookie set + redirect; invalid → 403).
- **Integration** (Vitest + supertest): `POST /api/messages` → message persisted in DB + `POST /emit` called on ws-server mock; `POST /emit` with wrong secret → 401.
- **Manual smoke test**: `pnpm dev`, navigate to `/?token=<PATIENT_DEVICE_TOKEN>` on patient app, tap "Start Glance", open dashboard, log in, send a message, confirm it appears on patient screen within 1 s.
- No E2E browser automation in Phase 1.

## Out of Scope

- Gaze direction detection, blink detection, scan mode
- CameraWindow scheduling or any webcam activation
- ElevenLabs voice cloning or audio playback of messages
- YesNoMode UI
- ToneClass / GPT message classification
- VoiceProfile management
- Multi-patient support
- Magic-link auth
- Push notifications
- Mobile / responsive layout (patient runs on a fixed display; dashboard is desktop-first)
- Production deployment / CI pipeline

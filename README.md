# Glance

Glance is a hands-free AAC communication platform for motor-impaired patients. Family members compose messages from a web dashboard; patients read and reply using **gaze and blink only** — no touch, keyboard, or mouse. Real-time delivery, voice cloning, and webcam-based gaze tracking are the core features.

## Architecture

```
┌─────────────────┐     REST + device token      ┌──────────────────┐
│  Patient app    │ ───────────────────────────► │  Dashboard app   │
│  :3000          │                              │  :3001           │
└────────┬────────┘                              └────────┬─────────┘
         │ socket.io                                       │ REST + internal secret
         │                                                 │
         └──────────────────────┬──────────────────────────┘
                                ▼
                       ┌─────────────────┐
                       │  WS server      │
                       │  :4000          │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Postgres       │
                       └─────────────────┘
```

| Component | Path | Purpose |
|---|---|---|
| Patient app | `apps/patient` | Gaze UI, message display, SOS, replies |
| Dashboard | `apps/dashboard` | Caregiver auth, compose, patient management |
| WS server | `apps/ws-server` | Real-time messages, SOS alerts, presence |
| Shared | `packages/shared` | DB schema, design system, WebSocket types |

## Quick start (Docker)

The easiest way to run Glance on any machine with [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2).

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set the required secrets:

```bash
# Generate values:
openssl rand -hex 32   # → BETTER_AUTH_SECRET and WS_INTERNAL_SECRET
uuidgen                # → PATIENT_DEVICE_TOKEN
```

### 2. Start the stack

```bash
docker compose up --build
```

First run builds images and applies database migrations. When all services are up:

| URL | App |
|---|---|
| http://localhost:3001 | Dashboard (caregiver) |
| http://localhost:3000 | Patient device |
| http://localhost:4000/health | WebSocket server health check |

### 3. Demo flow

1. Open **http://localhost:3001/signup** and create a caregiver account.
2. Skip voice onboarding if you have no ElevenLabs key (optional feature).
3. Click **Add patient** → register a patient → copy the **setup link**.
4. Open the setup link on the patient device (tablet/laptop with webcam). It pairs the browser and redirects to the patient home screen.
5. From the dashboard, send a message → it appears on the patient screen in real time.

**Single-device shortcut:** open `http://localhost:3000/?token=<PATIENT_DEVICE_TOKEN>` using the UUID from your `.env` file.

### Running on another computer (LAN demo)

If a second device on your network needs to reach the host machine, set your host IP in `.env` **before building**:

```bash
PUBLIC_DASHBOARD_URL=http://192.168.1.10:3001
PUBLIC_PATIENT_URL=http://192.168.1.10:3000
PUBLIC_WS_URL=http://192.168.1.10:4000
```

Then rebuild: `docker compose up --build`. These URLs are baked into the Next.js client bundles at build time.

### Docker commands

```bash
docker compose up --build    # build and start (foreground)
docker compose up -d         # start detached
docker compose down          # stop and remove containers
docker compose down -v       # also delete database + upload volumes
docker compose logs -f       # tail all service logs
```

## Local development (without Docker)

**Requirements:** Node.js ≥ 22, pnpm ≥ 9, Postgres 16.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure per-app env files

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/patient/.env.example apps/patient/.env.local
cp apps/ws-server/.env.example apps/ws-server/.env
```

Use the same secret values across all three files. See [Environment variables](#environment-variables) below.

### 3. Database

Create a Postgres database named `glance`, then:

```bash
DATABASE_URL=postgres://postgres:password@localhost:5432/glance \
PATIENT_DEVICE_TOKEN=<your-uuid> \
pnpm db:migrate
```

### 4. Start all services

```bash
pnpm dev
```

This starts patient (:3000), dashboard (:3001), and ws-server (:4000) concurrently via Turborepo.

## Environment variables

### Root `.env` (Docker Compose)

Used by `docker compose`. See [`.env.example`](.env.example) for the full list with comments.

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Postgres password |
| `BETTER_AUTH_SECRET` | yes | Session signing secret (≥ 32 chars) |
| `WS_INTERNAL_SECRET` | yes | Shared secret between dashboard and ws-server |
| `PATIENT_DEVICE_TOKEN` | yes | UUID seeded as the default patient device token |
| `PUBLIC_DASHBOARD_URL` | yes | Browser-facing dashboard URL |
| `PUBLIC_PATIENT_URL` | yes | Browser-facing patient URL |
| `PUBLIC_WS_URL` | yes | Browser-facing WebSocket server URL |
| `OPENAI_API_KEY` | no | Compose assist + reply ranking |
| `ELEVENLABS_API_KEY` | no | Voice cloning + cloned-voice TTS |
| `ELEVENLABS_DEFAULT_VOICE_ID` | no | Fallback voice when no clone exists |
| `MESSAGE_DISPLAY_SECONDS` | no | How long a message stays on screen (default 30) |

### Per-app env (local dev)

**Dashboard** (`apps/dashboard/.env.local`):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Same as Docker |
| `BETTER_AUTH_URL` | Dashboard origin, e.g. `http://localhost:3001` |
| `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` |
| `WS_SERVER_URL` | Server-side ws-server URL, e.g. `http://localhost:4000` |
| `WS_INTERNAL_SECRET` | Same as Docker |
| `PATIENT_DEVICE_TOKEN` | Same UUID used in migrate |
| `NEXT_PUBLIC_WS_SERVER_URL` | Browser-facing ws-server URL |
| `NEXT_PUBLIC_PATIENT_APP_URL` | Patient app origin for setup links |
| `OPENAI_API_KEY` | Optional |
| `ELEVENLABS_API_KEY` | Optional |
| `ELEVENLABS_DEFAULT_VOICE_ID` | Optional |

**Patient** (`apps/patient/.env.local`):

| Variable | Description |
|---|---|
| `DASHBOARD_URL` | Browser-facing dashboard URL |
| `DASHBOARD_INTERNAL_URL` | Server-side dashboard URL (Docker: `http://dashboard:3001`) |
| `WS_SERVER_URL` | Browser-facing ws-server URL |
| `PATIENT_DEVICE_TOKEN` | Optional static token for single-device dev |
| `MESSAGE_DISPLAY_SECONDS` | Optional display duration |

**WS server** (`apps/ws-server/.env`):

| Variable | Description |
|---|---|
| `PORT` | Listen port (default 4000) |
| `WS_INTERNAL_SECRET` | Same as dashboard |

## Testing

```bash
pnpm test        # all packages
pnpm typecheck   # TypeScript across the monorepo
```

## Project structure

```
Glance/
├── apps/
│   ├── dashboard/     # Next.js — caregiver dashboard + API routes
│   ├── patient/       # Next.js — patient gaze UI
│   └── ws-server/     # Express + Socket.IO — real-time transport
├── packages/
│   └── shared/        # Drizzle schema, migrations, design tokens
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── docs/              # Specs and design docs
```

## Product constraints

These are non-negotiable invariants — see [`AGENTS.md`](AGENTS.md) for the full list:

- **Zero hands** on the patient side — gaze and blink only.
- **Camera lifecycle** — every `MediaStream` track must be stopped on all exit paths.
- **AI content gate** — nothing is sent without explicit patient confirmation.
- **SOS independence** — SOS must work without the camera (microphone amplitude path).

## Optional features

Without API keys the core message loop still works:

| Feature | Requires |
|---|---|
| Real-time messaging | Nothing extra (works out of the box) |
| Compose assist / reply ranking | `OPENAI_API_KEY` |
| Cloned-voice TTS | `ELEVENLABS_API_KEY` |
| Gaze tracking | Webcam + HTTPS (or localhost) |

## Troubleshooting

**Patient shows "Device not set up"** — open the setup link from the dashboard, or visit `http://localhost:3000/?token=<PATIENT_DEVICE_TOKEN>`.

**Messages don't arrive in real time** — check ws-server is running (`curl http://localhost:4000/health`) and that `PUBLIC_WS_URL` matches what the browser can reach.

**403 on patient setup link** — rebuild the patient image after changing tokens or internal URLs: `docker compose up --build patient`.

**Camera/mic blocked** — browsers require HTTPS (or `localhost`) for `getUserMedia`. Use localhost for local demos or set public URLs to an HTTPS reverse proxy.

## License

Private — not licensed for redistribution.

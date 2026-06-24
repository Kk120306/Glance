# Glance monorepo — multi-target Dockerfile
# Targets: migrate | ws-server | dashboard | patient

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/patient/package.json apps/patient/
COPY apps/ws-server/package.json apps/ws-server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

ARG NEXT_PUBLIC_APP_URL=http://localhost:3001
ARG NEXT_PUBLIC_WS_SERVER_URL=http://localhost:4000
ARG NEXT_PUBLIC_PATIENT_APP_URL=http://localhost:3000
ARG DASHBOARD_INTERNAL_URL=http://dashboard:3001
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_WS_SERVER_URL=$NEXT_PUBLIC_WS_SERVER_URL
ENV NEXT_PUBLIC_PATIENT_APP_URL=$NEXT_PUBLIC_PATIENT_APP_URL
ENV DASHBOARD_INTERNAL_URL=$DASHBOARD_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @glance/ws-server build
RUN pnpm --filter @glance/dashboard build
RUN pnpm --filter @glance/patient build

# ── Database migrations (one-shot) ───────────────────────────────────────────
FROM deps AS migrate
COPY packages/shared packages/shared/
COPY tsconfig.json ./
ENV NODE_ENV=production
CMD ["pnpm", "db:migrate"]

# ── WebSocket server ─────────────────────────────────────────────────────────
FROM deps AS ws-server
COPY --from=builder /app/apps/ws-server/dist ./apps/ws-server/dist
ENV NODE_ENV=production
WORKDIR /app/apps/ws-server
EXPOSE 4000
CMD ["node", "dist/index.js"]

# ── Dashboard (Next.js standalone) ───────────────────────────────────────────
FROM base AS dashboard
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
WORKDIR /app
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
RUN mkdir -p apps/dashboard/public/uploads
COPY --from=builder /app/apps/dashboard/public/uploads ./apps/dashboard/public/uploads
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]

# ── Patient app (Next.js standalone) ─────────────────────────────────────────
FROM base AS patient
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=builder /app/apps/patient/.next/standalone ./
COPY --from=builder /app/apps/patient/.next/static ./apps/patient/.next/static
RUN mkdir -p apps/patient/public
EXPOSE 3000
CMD ["node", "apps/patient/server.js"]

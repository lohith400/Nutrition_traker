# syntax=docker/dockerfile:1.4
# -----------------------------------------------------------------------------
# Stage 1: Install dependencies
# -----------------------------------------------------------------------------
FROM node:20.18.3-alpine3.21 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# -----------------------------------------------------------------------------
FROM node:20.18.3-alpine3.21 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NOTE: NEXT_PUBLIC_* variables are inlined into the client-side JavaScript
# bundle at BUILD time by Next.js design. They are public by definition and
# must not contain secrets.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Ensure public folder exists even if empty/omitted in repository
RUN mkdir -p public

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Minimal production runner
# -----------------------------------------------------------------------------
FROM node:20.18.3-alpine3.21 AS runner
WORKDIR /app

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=0.1.0

LABEL org.opencontainers.image.title="NutriSync Frontend" \
      org.opencontainers.image.description="Next.js 14 standalone dashboard for NutriSync" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.authors="NutriSync Team" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/lohith400/Nutrition_traker"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 10001 nodejs \
    && adduser --system --uid 10001 nextjs

# Copy static assets and standalone server bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs:nodejs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]

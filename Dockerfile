# Production image for the StreamingHub Node server (SQLite + Next.js standalone).
#
# Die Basis-Images sind per Digest gepinnt: ein beweglicher Tag kann unter der
# gleichen Kennung ausgetauscht werden, und der naechste Build zoege das neue
# Image ungeprueft - dieselbe Luecke schliessen die Commit-SHAs bei den Actions.
# Der lesbare Tag bleibt vor dem Digest stehen, damit der Diff die Version zeigt.
# Beim Node-Update Tag und Digest gemeinsam anpassen; den aktuellen Digest eines
# Tags zeigt
#   docker buildx imagetools inspect node:22-bookworm-slim
# Geprueft von scripts/check-docker-base-images.mjs, inklusive Abgleich des
# Node-Majors mit engines.node in package.json.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runner
WORKDIR /app
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/backup-db.mjs ./scripts/backup-db.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/contact-retention.mjs ./scripts/contact-retention.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-retention.mjs ./scripts/audit-retention.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/staging-canary-assert.mjs ./scripts/staging-canary-assert.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/staging-canary-db-sweep.mjs ./scripts/staging-canary-db-sweep.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/public-html-cache-proxy.mjs ./scripts/public-html-cache-proxy.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/device-notice-smoke.mjs ./scripts/device-notice-smoke.mjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER nextjs
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]

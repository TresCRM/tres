# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN corepack enable && pnpm -v && pnpm install --frozen-lockfile
RUN pnpm exec tsc -p apps/api/tsconfig.json
# Prune to prod-only deps for the runtime image (keeps only what apps/api needs at runtime).
RUN pnpm install --frozen-lockfile --prod --config.confirmModulesPurge=false

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

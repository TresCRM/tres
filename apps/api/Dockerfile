# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN corepack enable && pnpm -v && pnpm install --frozen-lockfile
RUN pnpm exec tsc -p apps/api/tsconfig.json

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# copy only what's needed at runtime
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm fetch --prod && pnpm install -r --offline --prod
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

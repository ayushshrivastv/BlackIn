# Agent Challenge Monorepo

This repo now runs the Lighthouse frontend and backend from the root as one PNPM workspace.

## Root layout

- `apps/web`: Next.js frontend
- `apps/server`: API server
- `apps/socket`: websocket server
- `packages/database`: Prisma database package
- `packages/types`: shared types

## Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Review the merged root env files:

   - `.env`
   - `.env.local`

   If you need a fresh setup, copy `.env.example` to `.env` and then add your real values.

3. Start local infrastructure:

   ```bash
   docker compose up -d postgres redis
   ```

4. Push the Prisma schema:

   ```bash
   pnpm db:push
   ```

5. Run frontend, API, and socket together from the repo root:

   ```bash
   pnpm dev
   ```

## Useful root commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:server
pnpm dev:socket
pnpm build
pnpm lint
pnpm db:push
pnpm docker:up
pnpm docker:down
```

## Docker

The root `docker-compose.yml` boots:

- `postgres`
- `redis`
- `server`
- `socket`
- `web`

Run the full stack with:

```bash
docker compose up --build
```

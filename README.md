# BlackIn: Smart Contract Writing Assistant on Nosana

Nosana x ElizaOS Agent Challenge

BlackIn is a smart contract writing assistant built for developers who want to move from idea to deployed contract without the usual overhead. You describe what you want to build in plain language, and BlackIn generates a structured smart contract for you through a custom ElizaOS agent layer connected to our own backend. The AI inference runs on Nosana's decentralised GPU cloud on Nvidia GPUs, so instead of depending on centralised providers the entire generation layer runs on open decentralised infrastructure that is genuinely aligned with the ecosystem BlackIn is built for.

The experience is simple. You type a prompt, the agent processes it, and you get clean usable contract code back. No figuring out the structure line by line, no switching between tools. Once the contract is generated you can review it and deploy directly from the frontend in the same place. Prompt, contract, deployment, all in one flow, written in a secure and trusted environment from the start.

Watch Product Demo :https://www.youtube.com/watch?v=eVPGylGh7K4

<img width="300" height="300" alt="Screenshot 2026-04-14 at 2 15 53 AM" src="https://github.com/user-attachments/assets/c51366e7-9027-449c-b1aa-e525449ee3e7" />

<img width="700" height="700" alt="Screenshot 2026-04-14 at 2 15 53 AM" src="https://github.com/user-attachments/assets/bcd305a7-1ff2-42f1-ad60-9affbcba7e29" />

<img width="700" height="700" alt="Screenshot 2026-04-14 at 2 16 13 AM" src="https://github.com/user-attachments/assets/01b763a9-2d40-4de1-9660-e27b434fb457" />

---

## Overview

BlackIn is designed to make smart contract development feel conversational. Instead of starting from an empty editor, developers can describe a contract in plain English and let BlackIn turn that intent into working project structure, generated code, reviewable output, and deployment-ready artifacts.

BlackIn is focused on Solana smart contract workflows, with template-backed generation paths for common Solana and Anchor-style contract patterns.


## Local Development

### Prerequisites

- Node.js 20 or newer
- pnpm 9
- Docker and Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create your local environment file

```bash
cp .env.example .env
```

At minimum, review:

- `OPENAI_API_URL`, `OPENAI_API_KEY`, and `MODEL_NAME`
- database and Redis URLs
- auth and wallet configuration if you want the full sign-in flow
- Solana RPC, wallet, and deployment-related settings if you want live contract workflows

### 3. Start infrastructure services

```bash
docker compose up -d postgres redis
```

This starts:

- PostgreSQL on `localhost:5435`
- Redis on `localhost:6379`

### 4. Apply the database schema

```bash
pnpm db:push
```

### 5. Start the app

```bash
pnpm dev
```

That runs the full stack from the monorepo:

- web app on `http://localhost:3000`
- API server on `http://localhost:8787`
- WebSocket server on `ws://localhost:8282`

---

## Running Individual Services

```bash
pnpm dev:web
pnpm dev:server
pnpm dev:socket
```

Useful when you only want to work on one part of the product at a time.

---

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm db:push
pnpm db:migrate:dev
pnpm db:migrate:deploy
pnpm docker:up
pnpm docker:down
```

Server-specific test and backend workflow scripts are also available inside `apps/server`.

---

## Docker Workflow

To run the full stack with containers:

```bash
docker compose up --build
```

The compose setup includes:

- `postgres`
- `redis`
- `server`
- `socket`
- `web`

This is the quickest way to boot the entire product with the same service boundaries used by the monorepo.

---

---

## Monorepo Structure

```text
.
|-- apps
|   |-- web         # Next.js frontend
|   |-- server      # API and generation/deployment orchestration
|   `-- socket      # WebSocket server
|-- packages
|   |-- database    # Prisma schema, migrations, database package
|   |-- types       # Shared types and schemas
|   `-- config-*    # Shared TypeScript and ESLint config
|-- assets          # Project visuals
|-- docker          # Docker-related assets
`-- nos_job_def     # Nosana job definitions
```

---

## Key Features

### Prompt to contract generation

BlackIn takes a plain language request and turns it into structured contract output rather than a single code snippet.

### Real workspace experience

Generated output can be inspected across files, reviewed in the UI, and iterated on through the same session.

### Template support

The backend seeds reusable templates so users can start from common Solana contract patterns instead of beginning from scratch.

### Deployment aware backend

The server keeps track of contract metadata, deployment status, and related records so generation and deployment belong to one workflow.

### GitHub export

Users can connect GitHub and export generated projects directly from BlackIn.

### Real time updates

The WebSocket layer keeps the frontend synced with generation activity and longer-running backend actions.

---

## Environment Notes

The repository includes environment variables for three layers:

- Nosana inference and embedding endpoints
- BlackIn backend and frontend runtime configuration
- optional deployment, auth, object storage, and payments integrations

If you only want to run the interface locally, you can start with the default local database and Redis values from `.env.example` and fill in provider keys gradually.

For a fuller experience, configure:

- AI provider keys or Nosana endpoints
- Privy and WalletConnect credentials
- Solana wallet and RPC credentials
- GitHub integration credentials
- optional object storage and payment settings

---

## Deployment Direction

BlackIn is built around a flow where generation and deployment stay connected. The codebase already includes:

- deployment status tracking
- Solana-oriented contract templates and workflow metadata
- Nosana job definition assets
- containerized services for production-style runtime boundaries

For project submissions or demos, you can run the app locally with Docker or connect it to Nosana-backed inference and deployment flows through the provided environment settings.

---

## Why This Project Matters

BlackIn is trying to reduce the biggest friction in contract development:

- too much setup before the first line of useful code
- too many disconnected tools between idea, implementation, and deployment
- too much manual overhead for people who want to prototype quickly

By combining AI generation, a real editing surface, deployment-aware infrastructure, and decentralised compute, BlackIn pushes toward a smoother path from idea to a deployed Solana product.

---

## Demo

- Product demo: https://www.youtube.com/watch?v=eVPGylGh7K4

---

## License

This repository is licensed under the terms of the [LICENSE](./LICENSE) file.

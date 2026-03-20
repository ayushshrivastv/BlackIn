FROM node:20.19.0-bookworm-slim@sha256:5cfa999422613d3b34f766cbb814d964cbfcb76aaf3607e805da21cccb352bac

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install system dependencies required for CRE CLI + Foundry.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    curl \
    git \
    python3 \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
ARG CRE_CLI_VERSION=v1.2.0
ARG FOUNDRY_VERSION=v1.3.1
ARG PNPM_VERSION=9.0.0

# Install CRE CLI from pinned release asset (glibc-compatible build for Debian bookworm).
RUN case "${TARGETARCH}" in \
      amd64|arm64) CRE_ARCH="${TARGETARCH}" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    CRE_ASSET="cre_linux_${CRE_ARCH}_ldd2-35.tar.gz" && \
    curl -fsSL "https://github.com/smartcontractkit/cre-cli/releases/download/${CRE_CLI_VERSION}/${CRE_ASSET}" -o /tmp/cre.tar.gz && \
    tar -xzf /tmp/cre.tar.gz -C /tmp && \
    install -m 0755 "/tmp/cre_${CRE_CLI_VERSION}_linux_${CRE_ARCH}" /usr/local/bin/cre && \
    rm -f /tmp/cre.tar.gz "/tmp/cre_${CRE_CLI_VERSION}_linux_${CRE_ARCH}" && \
    cre version

# Install Foundry from pinned release asset.
RUN case "${TARGETARCH}" in \
      amd64|arm64) FOUNDRY_ARCH="${TARGETARCH}" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    FOUNDRY_ASSET="foundry_${FOUNDRY_VERSION}_linux_${FOUNDRY_ARCH}.tar.gz" && \
    curl -fsSL "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/${FOUNDRY_ASSET}" -o /tmp/foundry.tar.gz && \
    tar -xzf /tmp/foundry.tar.gz -C /usr/local/bin && \
    rm -f /tmp/foundry.tar.gz && \
    forge --version && \
    cast --version && \
    anvil --version

# Prepare prebuilt CRE workflow runtime dependencies for worker mode
RUN mkdir -p /opt/lighthouse/cre-workflow
RUN printf '{\n  "name": "cre-workflow-runtime",\n  "private": true,\n  "version": "1.0.0",\n  "dependencies": {\n    "@chainlink/cre-sdk": "1.0.7",\n    "viem": "2.39.0",\n    "zod": "3.24.1"\n  }\n}\n' > /opt/lighthouse/cre-workflow/package.json
WORKDIR /opt/lighthouse/cre-workflow
RUN npm install --omit=dev --no-audit --no-fund

# Install pnpm
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy application code
COPY apps/server/ ./apps/server/
COPY packages/ ./packages/

# Create .env file at root for Prisma
RUN echo 'DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"' > .env

# Install dependencies
RUN pnpm install --frozen-lockfile

# Don't modify prisma.config.ts - just generate with the .env file present
WORKDIR /app/packages/database
RUN npx prisma generate

# Build the server
WORKDIR /app/apps/server
RUN pnpm build

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787
CMD ["pnpm", "start"]

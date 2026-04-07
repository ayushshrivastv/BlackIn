-- Add chain support with BASE as default while preserving legacy Solana data.
CREATE TYPE "Chain" AS ENUM ('BASE', 'SOLANA');

ALTER TYPE "Command" ADD VALUE IF NOT EXISTS 'lighthouse_DEPLOY_BASE_SEPOLIA';
ALTER TYPE "Command" ADD VALUE IF NOT EXISTS 'lighthouse_DEPLOY_BASE_MAINNET';

ALTER TABLE "Contract"
ADD COLUMN "chain" "Chain" NOT NULL DEFAULT 'BASE';

ALTER TABLE "Template"
ADD COLUMN "chain" "Chain" NOT NULL DEFAULT 'BASE',
ADD COLUMN "baseNetwork" TEXT,
ADD COLUMN "frontendStack" TEXT,
ADD COLUMN "runtimeStack" TEXT,
ALTER COLUMN "solanaVersion" DROP NOT NULL,
ALTER COLUMN "anchorVersion" DROP NOT NULL;

ALTER TABLE "BuildJob"
ADD COLUMN "chain" "Chain" NOT NULL DEFAULT 'BASE';

ALTER TABLE "Deployment"
ADD COLUMN "chain" "Chain" NOT NULL DEFAULT 'BASE';

-- Backfill all historical rows as Solana legacy.
UPDATE "Contract" SET "chain" = 'SOLANA';
UPDATE "Template" SET "chain" = 'SOLANA';
UPDATE "BuildJob" SET "chain" = 'SOLANA';
UPDATE "Deployment" SET "chain" = 'SOLANA';

CREATE INDEX "Contract_chain_createdAt_idx" ON "Contract"("chain", "createdAt");
CREATE INDEX "Template_chain_createdAt_idx" ON "Template"("chain", "createdAt");
CREATE INDEX "BuildJob_chain_createdAt_idx" ON "BuildJob"("chain", "createdAt");

-- Align database defaults with the Solana-first product flow.
ALTER TABLE "Contract" ALTER COLUMN "chain" SET DEFAULT 'SOLANA';
ALTER TABLE "Template" ALTER COLUMN "chain" SET DEFAULT 'SOLANA';
ALTER TABLE "BuildJob" ALTER COLUMN "chain" SET DEFAULT 'SOLANA';
ALTER TABLE "Deployment" ALTER COLUMN "chain" SET DEFAULT 'SOLANA';

-- Persist CRE deployment metadata for Base runtime workflows.
ALTER TABLE "Deployment"
ADD COLUMN "metadata" JSONB;

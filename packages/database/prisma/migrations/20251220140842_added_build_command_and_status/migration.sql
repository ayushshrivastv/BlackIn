/*
  Warnings:

  - Added the required column `command` to the `BuildJob` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Command" AS ENUM ('lighthouse_BUILD', 'lighthouse_TEST', 'lighthouse_DEPLOY_DEVNET', 'lighthouse_DEPLOY_MAINNET', 'lighthouse_VERIFY');

-- AlterTable
ALTER TABLE "BuildJob" ADD COLUMN     "command" "Command" NOT NULL;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "lastBuildStatus" "BuildStatus" DEFAULT 'NEVER_BUILT',
ALTER COLUMN "lastBuildId" DROP NOT NULL;

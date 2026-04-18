/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { loadRepoEnv } from "../../src/load-repo-env";

loadRepoEnv(__dirname);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

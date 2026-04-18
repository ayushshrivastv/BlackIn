/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { z } from 'zod';
import { loadRepoEnv } from '../../../../src/load-repo-env';

loadRepoEnv(__dirname);

const envSchema = z.object({
    SERVER_NODE_ENV: z.enum(['development', 'production']).default('development'),
    SERVER_DEV_ACCESS_MODE: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SOCKET_JWT_SECRET: z.string(),
    SOCKET_REDIS_URL: z.url(),
    SOCKET_PORT: z.string().transform((val) => Number(val)),
    DATABASE_URL: z.url(),
});

function parseEnv() {
    try {
        return envSchema.parse(process.env);
    } catch (err) {
        console.error('error in validating', err);
        process.exit(1);
    }
}

export const env = parseEnv();

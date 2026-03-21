/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import dotenv from 'dotenv';
import path from 'path';
import z from 'zod';

dotenv.config({
    path: path.resolve(__dirname, '../../../.env'),
});

const envScehma = z.object({
    SERVER_NODE_ENV: z.enum(['development', 'production']),
    SERVER_DEV_ACCESS_MODE: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    DATABASE_URL: z.url(),
    SERVER_PORT: z
        .string()
        .default('8787')
        .transform((val) => parseInt(val, 10)),
    SERVER_JWT_SECRET: z.string().transform((val) => val.trim()),
    SERVER_OBJECT_STORE_MODE: z
        .string()
        .default('local')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_OBJECT_STORE_LOCAL_ROOT: z
        .string()
        .default('.runtime/object_store')
        .transform((val) => val.trim()),
    SERVER_AWS_ACCESS_KEY_ID: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_AWS_SECRET_ACCESS_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_AWS_REGION: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_AWS_BUCKET_NAME: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CLOUDFRONT_DOMAIN: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_RAZORPAY_KEY_ID: z.string().transform((val) => val.trim()),
    SERVER_RAZORPAY_KEY_SECRET: z.string().transform((val) => val.trim()),
    SERVER_REDIS_URL: z.string().transform((val) => val.trim()),
    SERVER_TURNSTILE_SERVER_KEY: z.string().transform((val) => val.trim()),
    SERVER_CLOUDFRONT_DOMAIN_TEMPLATES: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_ADMIN_SECRET: z.string().transform((val) => val.trim()),
    SERVER_CLOUDFRONT_DISTRIBUTION_ID: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_OPENROUTER_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_OPENAI_API_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_OPENAI_PRIMARY_MODEL: z
        .string()
        .default('gpt-4o-mini')
        .transform((val) => val.trim()),
    SERVER_GEMINI_API_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_RELEASE_SHA: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CRE_API_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CRE_CLI_PATH: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CRE_CLI_MIN_VERSION: z
        .string()
        .default('1.2.0')
        .transform((val) => val.trim()),
    SERVER_CRE_MIN_MAINNET_BALANCE_WEI: z
        .string()
        .default('1')
        .transform((val) => val.trim()),
    SERVER_CRE_RUNNER_MODE: z
        .string()
        .default('prebuilt')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_CRE_PREBUILT_NODE_MODULES_PATH: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CRE_STARTUP_PRECHECK_REQUIRED: z
        .string()
        .default('false')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_CRE_SIMULATE_ONLY: z
        .string()
        .default('false')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_CRE_ETH_PRIVATE_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CRE_WORKFLOW_OWNER_ADDRESS: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_ETHEREUM_MAINNET_RPC_URL: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_BASE_SEPOLIA_RPC_URL: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_BASE_MAINNET_RPC_URL: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_BASE_DEPLOYER_PRIVATE_KEY: z
        .string()
        .optional()
        .transform((val) => (val ?? '').trim()),
    SERVER_CHAIN_BASE_ENABLED: z
        .string()
        .default('true')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_CHAIN_SOLANA_ENABLED: z
        .string()
        .default('true')
        .transform((val) => val.trim().toLowerCase()),
    SERVER_CORS_ORIGINS: z
        .string()
        .optional()
        .transform((val) =>
            (val ?? '')
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
        ),
});

function parseScehma() {
    try {
        return envScehma.parse(process.env);
    } catch (err) {
        console.error('errror while parsing env : ', err);
        process.exit(1);
    }
}

const env = parseScehma();

export default env;

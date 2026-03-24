/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { COMMAND } from '@lighthouse/types';
import z from 'zod';

export const command_schema = z.enum([
    COMMAND.lighthouse_BUILD,
    COMMAND.lighthouse_TEST,
    // DISABLED - Solana chain (see /chains/solana).
    COMMAND.lighthouse_DEPLOY_DEVNET,
    // DISABLED - Solana chain (see /chains/solana).
    COMMAND.lighthouse_DEPLOY_MAINNET,
    COMMAND.lighthouse_DEPLOY_BASE_SEPOLIA,
    COMMAND.lighthouse_DEPLOY_BASE_MAINNET,
]);

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Chain, MODEL } from '@lighthouse/types';
import z from 'zod';

const byok_schema = z.object({
    provider: z.literal('openai_compatible'),
    model: z.string().min(1).max(200),
    apiKey: z.string().min(1).max(1000),
    baseURL: z.string().url().optional(),
});

export const generate_contract_schema = z.object({
    contract_id: z.string(),
    instruction: z.string().min(1).max(6000),
    chain: z.nativeEnum(Chain).optional(),
    model: z.enum([MODEL.CLAUDE, MODEL.GEMINI, MODEL.OPENAI_GPT_5_3, MODEL.QWEN_BYOK]).optional(),
    byok: byok_schema.optional(),
});

export const generate_contract = z.object({
    contract_id: z.string(),
    instruction: z.string().max(6000).optional(),
    template_id: z.string().optional(),
    chain: z.nativeEnum(Chain).optional(),
    model: z.enum([MODEL.CLAUDE, MODEL.GEMINI, MODEL.OPENAI_GPT_5_3, MODEL.QWEN_BYOK]).optional(),
    byok: byok_schema.optional(),
});

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { MODEL } from '@lighthouse/types';
import { shouldEnableDevAccessClient } from './runtime-mode';
import { QWEN_MODEL_OPTION } from './byok-model';

export const OPENAI_MODEL_OPTION = 'OpenAI GPT-5.4' as const;
export const GEMINI_MODEL_OPTION = 'Gemini 3.1 Pro' as const;

export const MODEL_OPTIONS = [
    'Auto Select',
    OPENAI_MODEL_OPTION,
    QWEN_MODEL_OPTION,
    'Claude Sonnet 4.6',
    GEMINI_MODEL_OPTION,
    'Claude Opus 4.6',
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];

export const DEFAULT_MODEL_OPTION: ModelOption = 'Auto Select';

let cachedDevelopmentDefaultModel: ModelOption | null = null;

export function isProModelOption(model: string): boolean {
    return (
        (model.includes('Claude') || model.includes('Gemini') || model.includes('OpenAI')) &&
        model !== QWEN_MODEL_OPTION
    );
}

export function isByokModelOption(model: string): boolean {
    return model === QWEN_MODEL_OPTION;
}

export function mapModelOptionToEnum(model: ModelOption): MODEL {
    switch (model) {
        case OPENAI_MODEL_OPTION:
            return MODEL.OPENAI_GPT_5_3;
        case QWEN_MODEL_OPTION:
            return MODEL.QWEN_BYOK;
        case 'Claude Sonnet 4.6':
        case 'Claude Opus 4.6':
            return MODEL.CLAUDE;
        case GEMINI_MODEL_OPTION:
        case 'Auto Select':
        default:
            return MODEL.GEMINI;
    }
}

export function mapEnumToModelOption(model: MODEL): ModelOption {
    if (shouldEnableDevAccessClient() && model === MODEL.OPENAI_GPT_5_3) {
        return QWEN_MODEL_OPTION;
    }

    switch (model) {
        case MODEL.OPENAI_GPT_5_3:
            return OPENAI_MODEL_OPTION;
        case MODEL.QWEN_BYOK:
            return QWEN_MODEL_OPTION;
        case MODEL.CLAUDE:
            return 'Claude Sonnet 4.6';
        case MODEL.GEMINI:
        default:
            return DEFAULT_MODEL_OPTION;
    }
}

export function resolveEffectiveRequestModel(model: MODEL): MODEL {
    if (shouldEnableDevAccessClient() && model === MODEL.QWEN_BYOK) {
        return MODEL.OPENAI_GPT_5_3;
    }

    return model;
}

export async function getDevelopmentDefaultModelOption(): Promise<ModelOption> {
    if (!shouldEnableDevAccessClient()) return DEFAULT_MODEL_OPTION;
    if (cachedDevelopmentDefaultModel) return cachedDevelopmentDefaultModel;

    cachedDevelopmentDefaultModel = QWEN_MODEL_OPTION;
    return cachedDevelopmentDefaultModel;
}

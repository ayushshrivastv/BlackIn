/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Request, Response } from 'express';
import ResponseWriter from '../../class/response_writer';
import env from '../../configs/config.env';
import { MODEL } from '@lighthouse/types';

export default function getModelCapabilitiesController(_req: Request, res: Response) {
    const hasOpenAi = Boolean((env.SERVER_OPENAI_API_KEY || '').trim());
    const hasOpenRouter = Boolean((env.SERVER_OPENROUTER_KEY || '').trim());
    const hasGemini = Boolean((env.SERVER_GEMINI_API_KEY || '').trim());

    const preferredModel =
        hasOpenAi || hasOpenRouter ? MODEL.OPENAI_GPT_5_3 : hasGemini ? MODEL.GEMINI : MODEL.GEMINI;

    ResponseWriter.success(
        res,
        {
            preferredModel,
            openAiAvailable: hasOpenAi || hasOpenRouter,
            geminiAvailable: hasGemini || hasOpenRouter,
            claudeAvailable: hasOpenRouter,
            primaryOpenAiModel: (env.SERVER_OPENAI_PRIMARY_MODEL || '').trim() || null,
        },
        'Fetched model capabilities',
    );
}

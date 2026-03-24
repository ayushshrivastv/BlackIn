/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { CorsOptions } from 'cors';

interface BuildCorsOptionsArgs {
    nodeEnv: 'development' | 'production';
    allowedOrigins: string[];
}

function normalizeOrigins(origins: string[]): string[] {
    return origins.map((origin) => origin.trim()).filter(Boolean);
}

export function buildCorsOptions(args: BuildCorsOptionsArgs): CorsOptions {
    const corsOrigins = normalizeOrigins(args.allowedOrigins);
    const useWildcardCors = corsOrigins.length === 0;
    if (args.nodeEnv === 'production' && useWildcardCors) {
        throw new Error(
            'SERVER_CORS_ORIGINS must be configured in production (comma-separated allowed origins).',
        );
    }

    return {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            if (useWildcardCors) {
                callback(null, true);
                return;
            }

            callback(null, corsOrigins.includes(origin));
        },
        credentials: !useWildcardCors,
    };
}

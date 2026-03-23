/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import env from '../configs/config.env';
import ResponseWriter from '../class/response_writer';

function shouldBypassInDevMode(): boolean {
    return env.SERVER_NODE_ENV !== 'production';
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}

export default function adminSecretMiddleware(req: Request, res: Response, next: NextFunction) {
    if (shouldBypassInDevMode()) {
        next();
        return;
    }

    const configuredSecret = (env.SERVER_ADMIN_SECRET || '').trim();
    if (!configuredSecret) {
        ResponseWriter.error(res, 'Admin secret is not configured', 503, 'ADMIN_SECRET_MISSING');
        return;
    }

    const providedSecret = (req.header('x-admin-secret') || '').trim();
    if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
        ResponseWriter.unauthorized(res, 'Unauthorized admin access');
        return;
    }

    next();
}

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { NextFunction, Request, Response } from 'express';
import env from '../configs/config.env';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types/express';
import ResponseWriter from '../class/response_writer';
import { prisma } from '@lighthouse/database';

function isTruthy(value?: string) {
    if (!value) return false;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function shouldBypassAuthInDevMode() {
    if (isTruthy(env.SERVER_DEV_ACCESS_MODE)) return true;
    return env.SERVER_NODE_ENV !== 'production';
}

export default async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const canBypassInDev = shouldBypassAuthInDevMode();

    if (canBypassInDev) {
        try {
            const devUser = await prisma.user.upsert({
                where: { email: 'dev@blackin.local' },
                update: {
                    name: 'Local Developer',
                    provider: 'dev',
                },
                create: {
                    id: 'dev-local-user',
                    email: 'dev@blackin.local',
                    name: 'Local Developer',
                    provider: 'dev',
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            });

            req.user = {
                id: devUser.id,
                name: devUser.name,
                email: devUser.email,
            };
            next();
            return;
        } catch (error) {
            console.error('Error creating local dev user: ', error);
            ResponseWriter.server_error(
                res,
                'Internal server error',
                error instanceof Error ? error.message : undefined,
            );
            return;
        }
    }

    if (!authHeader || !authHeader.startsWith('Bearer')) {
        res.status(401).json({
            success: false,
            message: 'Unauthorized',
        });
        return;
    }

    const token = authHeader.split(' ')[1];
    const secret = env.SERVER_JWT_SECRET;

    if (!secret) {
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
        return;
    }

    if (!token) {
        res.status(404).json({
            success: false,
            message: 'Token not found',
        });
        return;
    }

    try {
        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
                return;
            }
            req.user = decoded as AuthUser;
            next();
        });
    } catch (error) {
        console.error('Error in auth middleware: ', error);
        ResponseWriter.server_error(
            res,
            'Internal server error',
            error instanceof Error ? error.message : undefined,
        );
        return;
    }
}

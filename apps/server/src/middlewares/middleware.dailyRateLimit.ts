/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { NextFunction, Request, Response } from 'express';
import ResponseWriter from '../class/response_writer';
import { ChatRole, prisma } from '@lighthouse/database';
import { DAILY_LIMIT } from '@lighthouse/types';
import env from '../configs/config.env';

function isTruthy(value?: string) {
    if (!value) return false;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function isLocalhostRequestHost(host?: string) {
    if (!host) return false;
    const hostname = host.split(':')[0]?.toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
}

function shouldBypassLimitsInDevMode(req: Request) {
    if (isTruthy(env.SERVER_DEV_ACCESS_MODE)) return true;
    if (env.SERVER_NODE_ENV !== 'production') return true;
    return isLocalhostRequestHost(req.headers.host);
}

export default class DailyRateLimit {
    private static readonly WINDOW_MS: number = 24 * 60 * 60 * 1000;
    private static readonly LIMITS = {
        FREE: {
            CONTRACTS_PER_DAY: 3,
            MESSAGES_PER_CONTRACT: 3,
        },
        // change the values
        PREMIUM: {
            CONTRACTS_PER_DAY: 3,
            MESSAGES_PER_CONTRACT: 3,
        },
        PREMIUM_PLUS: {
            CONTRACTS_PER_DAY: 3,
            MESSAGES_PER_CONTRACT: 3,
        },
    };

    static async generate_contract_daily_limit(req: Request, res: Response, next: NextFunction) {
        try {
            if (shouldBypassLimitsInDevMode(req)) {
                next();
                return;
            }
            const user = req.user;
            if (!user || !user.id) {
                ResponseWriter.unauthorized(res);
                return;
            }
            // check subscription
            const user_record = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    subscription: true,
                },
            });

            const plan = user_record?.subscription?.plan ?? 'FREE';
            const limit = DailyRateLimit.LIMITS[plan];

            // the first message, that user sends is when the time starts
            const window_start = new Date(Date.now() - DailyRateLimit.WINDOW_MS);

            const contracts = await prisma.contract.findMany({
                where: {
                    userId: user.id,
                    createdAt: {
                        gte: window_start,
                    },
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });

            if (contracts.length >= limit.CONTRACTS_PER_DAY) {
                const oldest = contracts[0].createdAt;
                const allowed_time = new Date(oldest.getTime() + DailyRateLimit.WINDOW_MS);
                ResponseWriter.custom(res, 429, {
                    success: false,
                    message: 'Limit reached',
                    meta: {
                        next_allowed_time: allowed_time.toISOString(),
                        error_code: DAILY_LIMIT.CONTRACT_DAILY_LIMIT,
                        timestamp: Date.now().toString(),
                    },
                });
                return;
            }

            next();
        } catch (error) {
            console.error('Daily limit middleware error: ', error);
            ResponseWriter.server_error(
                res,
                'Internal server error',
                error instanceof Error ? error.message : undefined,
            );
            return;
        }
    }

    static async contract_messages_limit(req: Request, res: Response, next: NextFunction) {
        try {
            if (shouldBypassLimitsInDevMode(req)) {
                next();
                return;
            }
            const user = req.user;
            if (!user || !user.id) {
                ResponseWriter.unauthorized(res);
                return;
            }

            const { contract_id } = req.body;
            if (!contract_id) {
                ResponseWriter.not_found(res, 'Contract id not found');
                return;
            }

            // check subscription
            const user_record = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    subscription: true,
                },
            });

            const plan = user_record?.subscription?.plan ?? 'FREE';
            const limit = DailyRateLimit.LIMITS[plan];

            // get message count
            const message_count = await prisma.message.count({
                where: {
                    contractId: contract_id,
                    role: ChatRole.USER,
                },
            });

            // if message per contract limit exceeds deny the request
            if (message_count >= limit.MESSAGES_PER_CONTRACT) {
                ResponseWriter.custom(res, 429, {
                    success: false,
                    message: 'Limit reached',
                    meta: {
                        error_code: DAILY_LIMIT.MESSAGE_PER_CONTRACT_LIMIT,
                        timestamp: Date.now().toString(),
                    },
                });
                return;
            }

            next();
        } catch (error) {
            console.error('Contract messages limit middleware errir: ', error);
            ResponseWriter.server_error(
                res,
                'Internal server error',
                error instanceof Error ? error.message : undefined,
            );
            return;
        }
    }
}

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Prisma } from '@lighthouse/database';

export interface PrismaHttpError {
    statusCode: number;
    message: string;
    details?: string;
}

function stringifyMeta(meta: unknown): string {
    if (!meta) return '';
    try {
        return JSON.stringify(meta);
    } catch {
        return String(meta);
    }
}

export function resolvePrismaHttpError(error: unknown): PrismaHttpError | null {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
            return {
                statusCode: 409,
                message:
                    'A contract with this id already exists. Re-open the existing chat and retry.',
                details: `code=${error.code};meta=${stringifyMeta(error.meta)}`,
            };
        }

        if (error.code === 'P2025') {
            return {
                statusCode: 404,
                message: 'Requested contract record was not found.',
                details: `code=${error.code};meta=${stringifyMeta(error.meta)}`,
            };
        }

        if (error.code === 'P2003') {
            return {
                statusCode: 409,
                message: 'Database relation validation failed for this request.',
                details: `code=${error.code};meta=${stringifyMeta(error.meta)}`,
            };
        }

        return {
            statusCode: 500,
            message: 'Database request failed.',
            details: `code=${error.code};meta=${stringifyMeta(error.meta)}`,
        };
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        return {
            statusCode: 400,
            message: 'Invalid data was sent to the database layer.',
            details: error.message,
        };
    }

    if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientUnknownRequestError ||
        error instanceof Prisma.PrismaClientRustPanicError
    ) {
        return {
            statusCode: 503,
            message: 'Database service is temporarily unavailable.',
            details: error.message,
        };
    }

    return null;
}

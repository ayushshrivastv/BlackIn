/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Request, Response } from 'express';
import ResponseWriter from '../../class/response_writer';
import { prisma } from '@lighthouse/database';
import { Chain } from '@lighthouse/types';

export default async function getAllTemplates(req: Request, res: Response) {
    try {
        const templates = await prisma.template.findMany({
            where: {
                chain: Chain.SOLANA,
            },
            select: {
                id: true,
                title: true,
                description: true,
                category: true,
                chain: true,
                tags: true,
                s3_prefix: true,
                imageUrl: true,
                solanaVersion: true,
                anchorVersion: true,
                baseNetwork: true,
                frontendStack: true,
                runtimeStack: true,
                createdAt: true,
            },
        });

        ResponseWriter.success(res, templates, 'Fetched templates successfully');
        return;
    } catch (error) {
        ResponseWriter.server_error(
            res,
            'Internal server error',
            error instanceof Error ? error.message : undefined,
        );
        return;
    }
}

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Request, Response } from 'express';
import { prisma } from '@lighthouse/database';
import { Chain } from '@lighthouse/types';
import z from 'zod';
import ResponseWriter from '../../class/response_writer';

const paramsSchema = z.object({
    contractId: z.string().min(1),
});

export default async function getDeploymentStatus(req: Request, res: Response) {
    const user = req.user;
    if (!user || !user.id) {
        ResponseWriter.unauthorized(res);
        return;
    }

    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
        ResponseWriter.validation_error(res, 'Invalid contractId path parameter');
        return;
    }

    try {
        const contract = await prisma.contract.findUnique({
            where: {
                id: parsed.data.contractId,
                userId: user.id,
                chain: Chain.BASE,
            },
            select: {
                id: true,
                chain: true,
                deployed: true,
                programId: true,
                deployments: {
                    orderBy: {
                        deployedAt: 'desc',
                    },
                    take: 1,
                    select: {
                        id: true,
                        chain: true,
                        network: true,
                        status: true,
                        deployedAt: true,
                        txSignature: true,
                        metadata: true,
                    },
                },
            },
        });

        if (!contract) {
            ResponseWriter.not_found(res, 'Contract not found');
            return;
        }

        ResponseWriter.success(
            res,
            {
                contractId: contract.id,
                chain: contract.chain,
                deployed: contract.deployed,
                programId: contract.programId,
                latestDeployment: contract.deployments[0] || null,
            },
            'Fetched deployment status successfully',
        );
    } catch (error) {
        ResponseWriter.server_error(
            res,
            'Internal server error',
            error instanceof Error ? error.message : undefined,
        );
    }
}

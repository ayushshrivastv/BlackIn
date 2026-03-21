/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { BuildStatus, Chain, ChatRole, prisma } from '@lighthouse/database';
import { Request, Response } from 'express';
import z from 'zod';
import ResponseWriter from '../../class/response_writer';

const paramsSchema = z.object({
    contractId: z.string().min(1),
});

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const txPattern = /^0x[a-fA-F0-9]{64}$/;

const bodySchema = z.object({
    network: z.enum(['base-sepolia', 'base-mainnet']).default('base-sepolia'),
    contractAddress: z.string().regex(addressPattern, 'Invalid EVM contract address'),
    txHash: z.string().regex(txPattern, 'Invalid transaction hash'),
    explorerUrl: z.url().optional(),
    walletAddress: z.string().regex(addressPattern, 'Invalid wallet address').optional(),
});

export default async function registerSelfDeploy(req: Request, res: Response) {
    const user = req.user;
    if (!user || !user.id) {
        ResponseWriter.unauthorized(res);
        return;
    }

    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
        ResponseWriter.validation_error(res, 'Invalid contractId path parameter');
        return;
    }

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        ResponseWriter.validation_error(
            res,
            parsedBody.error.issues[0]?.message || 'Invalid deployment payload',
        );
        return;
    }

    const { contractId } = parsedParams.data;
    const payload = parsedBody.data;

    try {
        const contract = await prisma.contract.findUnique({
            where: {
                id: contractId,
                userId: user.id,
                chain: Chain.BASE,
            },
            select: {
                id: true,
                userId: true,
                chain: true,
            },
        });

        if (!contract) {
            ResponseWriter.not_found(res, 'Contract not found');
            return;
        }

        const deployment = await prisma.$transaction(async (tx) => {
            const created = await tx.deployment.create({
                data: {
                    contractId: contract.id,
                    chain: Chain.BASE,
                    network: payload.network,
                    status: 'success',
                    txSignature: payload.txHash,
                    deployedAt: new Date(),
                    metadata: {
                        source: 'user-wallet',
                        selfDeployed: true,
                        explorerUrl: payload.explorerUrl || null,
                        walletAddress: payload.walletAddress || null,
                    } as unknown as object,
                },
                select: {
                    id: true,
                    chain: true,
                    network: true,
                    status: true,
                    deployedAt: true,
                    txSignature: true,
                    metadata: true,
                },
            });

            await tx.contract.update({
                where: { id: contract.id },
                data: {
                    deployed: true,
                    programId: payload.contractAddress,
                    lastBuildStatus: BuildStatus.SUCCESS,
                },
            });

            await tx.message.create({
                data: {
                    contractId: contract.id,
                    role: ChatRole.SYSTEM,
                    content: [
                        `User wallet deployment recorded on ${payload.network}.`,
                        `Contract: ${payload.contractAddress}`,
                        `Transaction: ${payload.txHash}`,
                        payload.explorerUrl ? `Explorer: ${payload.explorerUrl}` : '',
                    ]
                        .filter(Boolean)
                        .join('\n'),
                },
            });

            return created;
        });

        ResponseWriter.success(
            res,
            {
                contractId: contract.id,
                chain: Chain.BASE,
                deployed: true,
                programId: payload.contractAddress,
                latestDeployment: deployment,
            },
            'Self deployment recorded successfully',
        );
    } catch (error) {
        ResponseWriter.server_error(
            res,
            'Internal server error',
            error instanceof Error ? error.message : undefined,
        );
    }
}

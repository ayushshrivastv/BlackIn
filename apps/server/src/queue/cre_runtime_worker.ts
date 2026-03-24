/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { BuildStatus, Chain, ChatRole, prisma } from '@lighthouse/database';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
    IncomingPayload,
    TerminalSocketData,
    WSServerIncomingPayload,
    COMMAND,
} from '@lighthouse/types';
import env from '../configs/config.env';
import queue_config from '../configs/config.queue';
import ObjectStore from '../class/object_store';
import { CreDeployJobPayload } from './cre_worker_queue';
import {
    executeCreDeployWorkflow,
    executeCreGenerationWorkflow,
    BaseNetwork,
} from '../chains/base/cre_adapter';

type DeployCommand =
    | COMMAND.lighthouse_DEPLOY_BASE_SEPOLIA
    | COMMAND.lighthouse_DEPLOY_BASE_MAINNET;

export default class CreRuntimeWorker {
    private readonly deploy_worker: Worker<CreDeployJobPayload>;
    private readonly publisher: Redis;
    private readonly object_store: ObjectStore;

    constructor(object_store: ObjectStore) {
        this.object_store = object_store;
        this.publisher = new Redis(env.SERVER_REDIS_URL);
        this.deploy_worker = new Worker(
            'cre-deploy',
            this.process_deploy_job.bind(this),
            queue_config,
        );
    }

    private network_command(network: BaseNetwork): DeployCommand {
        return network === 'base-mainnet'
            ? COMMAND.lighthouse_DEPLOY_BASE_MAINNET
            : COMMAND.lighthouse_DEPLOY_BASE_SEPOLIA;
    }

    private is_simulate_only_mode() {
        const flag = (env.SERVER_CRE_SIMULATE_ONLY || '').trim().toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(flag);
    }

    private has_cre_api_key() {
        return Boolean((env.SERVER_CRE_API_KEY || '').trim());
    }

    private async publish_terminal(
        user_id: string,
        contract_id: string,
        type: TerminalSocketData,
        line: string,
    ) {
        if (!user_id || !contract_id) return;
        const channel = `${user_id}_${contract_id}`;
        const payload: WSServerIncomingPayload<IncomingPayload> = {
            type,
            payload: {
                userId: user_id,
                contractId: contract_id,
                line,
                timestamp: Date.now(),
            },
        };
        try {
            await this.publisher.publish(channel, JSON.stringify(payload));
        } catch (error) {
            console.error('failed to publish cre progress event', error);
        }
    }

    private async process_deploy_job(job: Job<CreDeployJobPayload>) {
        const payload = job.data;
        if (payload.chain !== 'BASE') {
            // DISABLED - Solana chain (see /chains/solana).
            throw new Error(`Unsupported chain for cre-deploy: ${payload.chain}`);
        }

        const started_at = Date.now();
        const contract = await prisma.contract.findUnique({
            where: { id: payload.contractId },
            select: {
                id: true,
                chain: true,
                title: true,
                userId: true,
            },
        });
        if (!contract) {
            throw new Error(`Contract ${payload.contractId} not found`);
        }
        if (contract.chain !== Chain.BASE) {
            // DISABLED - Solana chain (see /chains/solana).
            throw new Error(`Contract chain ${contract.chain} is disabled for CRE deploy`);
        }

        if (!this.has_cre_api_key()) {
            await this.publish_terminal(
                contract.userId,
                contract.id,
                TerminalSocketData.LOGS,
                'CRE workflow skipped: SERVER_CRE_API_KEY is not configured.',
            );
            return {
                skipped: true,
                reason: 'missing SERVER_CRE_API_KEY',
                contractId: contract.id,
                network: payload.network,
            };
        }

        const command = this.network_command(payload.network);
        let build_job_id: string | null = null;
        let deployment_id: string | null = null;
        const queue_job_id = String(job.id);

        try {
            await this.publish_terminal(
                contract.userId,
                contract.id,
                TerminalSocketData.EXECUTING_COMMAND,
                `CRE deploy job started for ${payload.network}.`,
            );

            const existing_build_job = await prisma.buildJob.findFirst({
                where: {
                    contractId: contract.id,
                    jobId: queue_job_id,
                },
                select: {
                    id: true,
                },
            });

            if (existing_build_job) {
                build_job_id = existing_build_job.id;
                await prisma.buildJob.update({
                    where: {
                        id: existing_build_job.id,
                    },
                    data: {
                        status: BuildStatus.PROCESSING,
                        startedAt: new Date(),
                        command,
                        chain: Chain.BASE,
                    },
                });
            } else {
                const created_build_job = await prisma.buildJob.create({
                    data: {
                        contractId: contract.id,
                        chain: Chain.BASE,
                        jobId: queue_job_id,
                        status: BuildStatus.PROCESSING,
                        command,
                        startedAt: new Date(),
                    },
                    select: {
                        id: true,
                    },
                });
                build_job_id = created_build_job.id;
            }

            const deployment = await prisma.deployment.create({
                data: {
                    contractId: contract.id,
                    chain: Chain.BASE,
                    network: payload.network,
                    status: 'pending',
                },
                select: { id: true },
            });
            deployment_id = deployment.id;

            const resource_files = await this.object_store.get_resource_files(contract.id);
            if (!resource_files || resource_files.length === 0) {
                throw new Error('No generated files found for contract deployment');
            }

            const simulate_only = this.is_simulate_only_mode();
            if (simulate_only) {
                await this.publish_terminal(
                    contract.userId,
                    contract.id,
                    TerminalSocketData.LOGS,
                    `CRE simulate-only mode is enabled. Running workflow simulation for ${payload.network} (no deploy/activate).`,
                );

                const simulation_result = await executeCreGenerationWorkflow(
                    `Simulate workflow for contract ${contract.id} (${contract.title})`,
                    payload.network,
                );
                const duration = Date.now() - started_at;

                await prisma.$transaction(async (tx) => {
                    if (build_job_id) {
                        await tx.buildJob.update({
                            where: { id: build_job_id },
                            data: {
                                status: BuildStatus.SUCCESS,
                                completedAt: new Date(),
                                duration,
                                output: simulation_result as unknown as object,
                                error: null,
                            },
                        });
                    }

                    await tx.contract.update({
                        where: { id: contract.id },
                        data: {
                            chain: Chain.BASE,
                            lastBuildStatus: BuildStatus.SUCCESS,
                            lastBuildId: queue_job_id,
                        },
                    });

                    if (deployment_id) {
                        await tx.deployment.update({
                            where: { id: deployment_id },
                            data: {
                                status: 'success',
                                txSignature: null,
                                deployedAt: new Date(),
                                metadata: {
                                    simulateOnly: true,
                                    workflowId: simulation_result.workflowId,
                                    summary: simulation_result.summary,
                                    logs: simulation_result.logs,
                                    preflight: simulation_result.preflight,
                                } as unknown as object,
                            },
                        });
                    }

                    await tx.message.create({
                        data: {
                            contractId: contract.id,
                            role: ChatRole.SYSTEM,
                            content: [
                                `CRE simulation completed on ${payload.network}.`,
                                `Summary: ${simulation_result.summary}`,
                                `Workflow ID: ${simulation_result.workflowId}`,
                            ].join('\n'),
                        },
                    });
                });

                await this.publish_terminal(
                    contract.userId,
                    contract.id,
                    TerminalSocketData.COMPLETED,
                    `Simulation complete on ${payload.network}. Deploy/activate skipped (simulate-only mode).`,
                );

                return simulation_result;
            }

            await this.publish_terminal(
                contract.userId,
                contract.id,
                TerminalSocketData.LOGS,
                `CRE deploy loaded ${resource_files.length} files. Executing deployment action...`,
            );

            const deployment_result = await executeCreDeployWorkflow({
                contractId: contract.id,
                network: payload.network,
                files: resource_files,
                onProgress: async (line) => {
                    if (!line) return;
                    await this.publish_terminal(
                        contract.userId,
                        contract.id,
                        TerminalSocketData.LOGS,
                        line,
                    );
                },
            });

            const primary_contract = deployment_result.contracts[0];
            const has_valid_contract_address =
                !!primary_contract?.address &&
                /^0x[a-fA-F0-9]{40}$/.test(primary_contract.address) &&
                primary_contract.address.toLowerCase() !==
                    '0x0000000000000000000000000000000000000000';
            if (!deployment_result.contractDeploySucceeded || !has_valid_contract_address) {
                throw new Error(
                    'CRE deploy finished without a valid Base contract deployment result.',
                );
            }
            const duration = Date.now() - started_at;

            await prisma.$transaction(async (tx) => {
                if (build_job_id) {
                    await tx.buildJob.update({
                        where: { id: build_job_id },
                        data: {
                            status: BuildStatus.SUCCESS,
                            completedAt: new Date(),
                            duration,
                            output: deployment_result as unknown as object,
                            error: null,
                        },
                    });
                }

                await tx.contract.update({
                    where: { id: contract.id },
                    data: {
                        chain: Chain.BASE,
                        deployed: true,
                        programId: primary_contract.address,
                        lastBuildStatus: BuildStatus.SUCCESS,
                        lastBuildId: queue_job_id,
                    },
                });

                if (deployment_id) {
                    await tx.deployment.update({
                        where: { id: deployment_id },
                        data: {
                            status: 'success',
                            txSignature:
                                deployment_result.txHash ??
                                deployment_result.registryTxHash ??
                                null,
                            deployedAt: new Date(),
                            metadata: deployment_result.metadata as unknown as object,
                        },
                    });
                }

                await tx.message.create({
                    data: {
                        contractId: contract.id,
                        role: ChatRole.SYSTEM,
                        content: [
                            `CRE deploy completed on ${payload.network}.`,
                            deployment_result.txHash
                                ? `Transaction: ${deployment_result.txHash}`
                                : 'Transaction hash unavailable.',
                            deployment_result.explorerUrl
                                ? `Explorer: ${deployment_result.explorerUrl}`
                                : '',
                            deployment_result.registryTxHash
                                ? `Registry Transaction: ${deployment_result.registryTxHash}`
                                : '',
                            deployment_result.registryExplorerUrl
                                ? `Registry Explorer: ${deployment_result.registryExplorerUrl}`
                                : '',
                            deployment_result.workflowId
                                ? `Workflow ID: ${deployment_result.workflowId}`
                                : '',
                            deployment_result.workflowName
                                ? `Workflow Name: ${deployment_result.workflowName}`
                                : '',
                            primary_contract
                                ? `Contract ${primary_contract.name}: ${primary_contract.address}`
                                : '',
                        ]
                            .filter(Boolean)
                            .join('\n'),
                    },
                });
            });

            await this.publish_terminal(
                contract.userId,
                contract.id,
                TerminalSocketData.COMPLETED,
                deployment_result.explorerUrl
                    ? `Deploy complete on ${payload.network}. ${deployment_result.explorerUrl}`
                    : `Deploy complete on ${payload.network}.`,
            );

            return deployment_result;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown cre deploy error';
            const duration = Date.now() - started_at;

            await prisma.$transaction(async (tx) => {
                if (build_job_id) {
                    await tx.buildJob.update({
                        where: { id: build_job_id },
                        data: {
                            status: BuildStatus.FAILED,
                            completedAt: new Date(),
                            duration,
                            error: message,
                        },
                    });
                }

                await tx.contract.update({
                    where: { id: contract.id },
                    data: {
                        lastBuildStatus: BuildStatus.FAILED,
                        lastBuildId: queue_job_id,
                    },
                });

                if (deployment_id) {
                    await tx.deployment.update({
                        where: { id: deployment_id },
                        data: {
                            status: 'failed',
                            metadata: {
                                error: message,
                                failedAt: new Date().toISOString(),
                            },
                        },
                    });
                }

                await tx.message.create({
                    data: {
                        contractId: contract.id,
                        role: ChatRole.SYSTEM,
                        content: `CRE deploy failed on ${payload.network}: ${message}`,
                    },
                });
            });

            await this.publish_terminal(
                contract.userId,
                contract.id,
                TerminalSocketData.BUILD_ERROR,
                `Deploy failed on ${payload.network}: ${message}`,
            );

            throw error;
        }
    }
}

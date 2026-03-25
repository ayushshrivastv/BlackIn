/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { prisma } from '@lighthouse/database';
import { CustomWebSocket } from '../types/socket_types';
import { ParsedMessage } from '../ws/socket.server';
import BuildCache from './services.build_cache';
import {
    Chain,
    WSServerIncomingPayload,
    TerminalSocketData,
    BuildJobPayload,
    IncomingPayload,
    COMMAND,
} from '@lighthouse/types';
import { cre_deploy_queue, socket_orchestrator_queue } from './services.init';

export default class CommandService {
    private static is_base_deploy_command(command: COMMAND): boolean {
        return (
            command === COMMAND.lighthouse_DEPLOY_BASE_SEPOLIA ||
            command === COMMAND.lighthouse_DEPLOY_BASE_MAINNET
        );
    }

    private static is_legacy_solana_deploy_command(command: COMMAND): boolean {
        return (
            command === COMMAND.lighthouse_DEPLOY_DEVNET ||
            command === COMMAND.lighthouse_DEPLOY_MAINNET
        );
    }

    private static resolve_base_network(command: COMMAND): 'base-sepolia' | 'base-mainnet' {
        return command === COMMAND.lighthouse_DEPLOY_BASE_MAINNET ? 'base-mainnet' : 'base-sepolia';
    }

    static async handle_incoming_command<T>(
        ws: CustomWebSocket,
        message: ParsedMessage<T>,
    ): Promise<WSServerIncomingPayload<IncomingPayload>> {
        const createPayload = (line: string): IncomingPayload => ({
            userId: ws.user.id,
            contractId: ws.contractId,
            line,
            timestamp: Date.now(),
        });

        try {
            const contractId = ws.contractId;
            console.log('contract id is : ', contractId);
            if (!contractId || typeof contractId !== 'string') {
                return {
                    type: TerminalSocketData.VALIDATION_ERROR,
                    payload: createPayload('Invalid or missing contract ID'),
                };
            }

            const contract = await prisma.contract.findUnique({
                where: { id: contractId },
            });

            if (!contract) {
                return {
                    type: TerminalSocketData.VALIDATION_ERROR,
                    payload: createPayload(`Contract with ID ${contractId} not found`),
                };
            }

            if (contract.chain !== Chain.BASE) {
                // DISABLED - Solana chain (see /chains/solana).
                return {
                    type: TerminalSocketData.VALIDATION_ERROR,
                    payload: createPayload(
                        `Contract on ${contract.chain} is disabled for execution. Use BASE contracts only.`,
                    ),
                };
            }

            if (this.is_legacy_solana_deploy_command(message.type)) {
                // DISABLED - Solana chain (see /chains/solana).
                return {
                    type: TerminalSocketData.VALIDATION_ERROR,
                    payload: createPayload(
                        'Solana deploy commands are disabled. Use lighthouse_DEPLOY_BASE_SEPOLIA or lighthouse_DEPLOY_BASE_MAINNET.',
                    ),
                };
            }

            const is_base_deploy = this.is_base_deploy_command(message.type);
            if (is_base_deploy) {
                const simulateOnly = ['1', 'true', 'yes', 'on'].includes(
                    (process.env.SERVER_CRE_SIMULATE_ONLY || '').trim().toLowerCase(),
                );
                const apiKey = (process.env.SERVER_CRE_API_KEY || '').trim();
                const privateKey = (
                    process.env.SERVER_CRE_ETH_PRIVATE_KEY ||
                    process.env.SERVER_BASE_DEPLOYER_PRIVATE_KEY ||
                    ''
                ).trim();

                if (!apiKey || (!simulateOnly && !privateKey)) {
                    return {
                        type: TerminalSocketData.VALIDATION_ERROR,
                        payload: createPayload(
                            simulateOnly
                                ? 'CRE simulate-only run is unavailable: SERVER_CRE_API_KEY must be configured.'
                                : 'CRE deploy is unavailable: SERVER_CRE_API_KEY and deployer private key must be configured.',
                        ),
                    };
                }
            }

            const is_cached = !is_base_deploy && BuildCache.check_build_cache(contract);

            if (is_cached) {
                return {
                    type: TerminalSocketData.INFO,
                    payload: createPayload('Build retrieved from cache'),
                };
            }

            const data: BuildJobPayload = {
                jobId: '',
                contractId: ws.contractId,
                contractName: '',
                userId: ws.user.id,
                timestamp: Date.now(),
                command: message.type,
            };

            let job_id: string | undefined;
            if (is_base_deploy) {
                job_id = await cre_deploy_queue.queue_cre_deploy({
                    chain: 'BASE',
                    contractId: ws.contractId,
                    network: this.resolve_base_network(message.type),
                    createdAt: Date.now(),
                });
            } else {
                job_id = await socket_orchestrator_queue.queue_command(message.type, data);
            }

            if (!job_id) {
                return {
                    type: TerminalSocketData.SERVER_MESSAGE,
                    payload: createPayload('Internal server error while running your command'),
                };
            }

            await prisma.buildJob.create({
                data: {
                    contractId: contract.id,
                    chain: Chain.BASE,
                    jobId: job_id,
                    status: 'QUEUED',
                    command: message.type,
                    startedAt: new Date(),
                },
            });

            return {
                type: TerminalSocketData.INFO,
                payload: createPayload('Command queued. Starting job...'),
            };
        } catch (err) {
            console.error('error while running command', err);
            return {
                type: TerminalSocketData.SERVER_MESSAGE,
                payload: createPayload('Internal server error while running your command'),
            };
        }
    }
}

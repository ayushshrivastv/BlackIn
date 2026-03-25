/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Queue } from 'bullmq';
import { BuildJobPayload, COMMAND } from '@lighthouse/types';
import crypto from 'crypto';
import queue_config from '../configs/config.queue';

export interface CreDeployQueuePayload {
    chain: 'BASE';
    contractId: string;
    network: 'base-sepolia' | 'base-mainnet';
    createdAt: number;
}

export default class SocketToOrchestratorQueue {
    private queue: Queue;
    constructor(queue_name: string) {
        this.queue = new Queue(queue_name, queue_config);
    }

    /**
     * queues the users command to the server kubernetes queue
     * @param command
     * @param payload
     * @returns job id of the job which is been queued
     */
    public async queue_command(
        command: COMMAND,
        payload: BuildJobPayload,
    ): Promise<string | undefined> {
        try {
            const job = await this.queue.add(command, payload, {
                priority: 2,
                attempts: 1,
                jobId: `base-command-${payload.contractId}-${this.create_job_id()}`,
            });
            console.log('added to the queue');
            return job.id;
        } catch (err) {
            console.error('failed to run base build command', err);
            return undefined;
        }
    }

    public async queue_cre_deploy(payload: CreDeployQueuePayload): Promise<string | undefined> {
        try {
            const job = await this.queue.add('cre-deploy', payload, {
                priority: 1,
                attempts: 2,
                jobId: `cre-deploy-${payload.contractId}-${payload.network}-${payload.createdAt}`,
            });
            return typeof job.id === 'string' ? job.id : `${job.id ?? ''}`;
        } catch (err) {
            console.error('failed to queue cre deploy command', err);
            return undefined;
        }
    }

    private create_job_id() {
        return crypto.randomBytes(10).toString('hex');
    }
}

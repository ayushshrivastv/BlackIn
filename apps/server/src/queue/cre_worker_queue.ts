/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Queue } from 'bullmq';
import queue_config from '../configs/config.queue';

export interface CreDeployJobPayload {
    chain: 'BASE';
    contractId: string;
    network: 'base-sepolia' | 'base-mainnet';
    createdAt: number;
}

export default class CreWorkerQueue {
    private queue: Queue;

    constructor(queueName: string) {
        this.queue = new Queue(queueName, queue_config);
    }

    public async enqueue_deploy(payload: CreDeployJobPayload) {
        return this.queue.add('cre-deploy', payload, {
            jobId: `cre-deploy-${payload.contractId}-${payload.network}-${payload.createdAt}`,
            attempts: 2,
            priority: 1,
        });
    }
}

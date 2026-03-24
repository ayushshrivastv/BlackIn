/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import ObjectStore from '../class/object_store';
import Generator from '../generator/generator';
import RazorpayGateway from '../payments/razorpay';
import { GithubWorkerQueue } from '../queue/github_worker_queue';
import { seedTemplates } from './seed_templates';
import GithubServices from './services.github';
import CreWorkerQueue from '../queue/cre_worker_queue';
import CreRuntimeWorker from '../queue/cre_runtime_worker';
import { runCreStartupPreflight } from '../chains/base/cre_adapter';
import env from '../configs/config.env';

export let objectStore: ObjectStore;
export let razorpay: RazorpayGateway;
export let github_worker_queue: GithubWorkerQueue;
export let cre_deploy_queue: CreWorkerQueue;
export let cre_runtime_worker: CreRuntimeWorker;
export let generator: Generator;
export let github_services: GithubServices;

export default async function init_services() {
    const require_startup_precheck = ['1', 'true', 'yes', 'on'].includes(
        (env.SERVER_CRE_STARTUP_PRECHECK_REQUIRED || '').toLowerCase(),
    );
    try {
        await runCreStartupPreflight();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown startup preflight error';
        if (require_startup_precheck) {
            throw new Error(`CRE startup precheck failed: ${message}`);
        }
        console.warn(`CRE startup precheck skipped: ${message}`);
    }

    objectStore = new ObjectStore();
    razorpay = new RazorpayGateway();
    github_worker_queue = new GithubWorkerQueue('github-push');
    cre_deploy_queue = new CreWorkerQueue('cre-deploy');
    cre_runtime_worker = new CreRuntimeWorker(objectStore);
    generator = new Generator();
    github_services = new GithubServices(objectStore);

    try {
        await seedTemplates();
    } catch (error) {
        console.error('templates', error);
    }
}

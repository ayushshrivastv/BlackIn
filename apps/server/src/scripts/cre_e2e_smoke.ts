/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface SseEvent {
    type?: string;
    data?: Record<string, unknown>;
    timestamp?: number;
}

interface ApiEnvelope<T> {
    success?: boolean;
    message?: string;
    data?: T;
}

interface DeploymentStatusData {
    contractId: string;
    chain: string;
    deployed: boolean;
    programId: string | null;
    latestDeployment: {
        id: string;
        chain: string;
        network: string;
        status: string;
        deployedAt: string;
        txSignature: string | null;
        metadata: Record<string, unknown> | null;
    } | null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureAddress(value?: string | null): boolean {
    if (!value) return false;
    return (
        /^0x[a-fA-F0-9]{40}$/.test(value) && value !== '0x0000000000000000000000000000000000000000'
    );
}

async function readSseUntilEnd(response: Response, timeoutMs: number): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Generate endpoint did not return an SSE stream body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + timeoutMs;
    let sawEndEvent = false;

    while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex >= 0) {
            const chunk = buffer.slice(0, separatorIndex).trim();
            buffer = buffer.slice(separatorIndex + 2);
            separatorIndex = buffer.indexOf('\n\n');

            if (!chunk) continue;
            const dataLine = chunk
                .split('\n')
                .map((line) => line.trim())
                .find((line) => line.startsWith('data:'));
            if (!dataLine) continue;

            const payload = dataLine.slice(5).trim();
            if (!payload) continue;

            let event: SseEvent | null = null;
            try {
                event = JSON.parse(payload) as SseEvent;
            } catch {
                continue;
            }

            if (!event?.type) continue;
            if (event.type === 'ERROR') {
                throw new Error(`Generation stream reported ERROR event: ${payload}`);
            }
            if (event.type === 'END') {
                sawEndEvent = true;
                break;
            }
        }

        if (sawEndEvent) break;
    }

    if (!sawEndEvent) {
        throw new Error(
            `Timed out waiting for END event from generation stream after ${timeoutMs}ms`,
        );
    }
}

async function waitForDeployment(contractId: string, timeoutMs: number, pollMs: number) {
    const baseUrl = (process.env.SMOKE_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
    const authToken = (process.env.SMOKE_AUTH_TOKEN || '').trim();
    const headers: Record<string, string> = {
        Accept: 'application/json',
    };
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const endpoint = `${baseUrl}/api/v1/contracts/${contractId}/deployment-status`;
        const response = await fetch(endpoint, {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            await sleep(pollMs);
            continue;
        }

        const parsed = (await response.json()) as ApiEnvelope<DeploymentStatusData>;
        const deploymentStatus = parsed.data?.latestDeployment?.status;

        if (deploymentStatus === 'success' || deploymentStatus === 'failed') {
            return parsed.data as DeploymentStatusData;
        }

        await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for deployment completion after ${timeoutMs}ms`);
}

async function writeArtifact(filePath: string, payload: Record<string, unknown>) {
    const resolvedPath = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[CRE smoke] artifact written to ${resolvedPath}`);
}

async function main() {
    const baseUrl = (process.env.SMOKE_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
    const authToken = (process.env.SMOKE_AUTH_TOKEN || '').trim();
    const instruction =
        (process.env.SMOKE_PROMPT || '').trim() ||
        'Build a Base-native subscription dashboard with a Solidity contract, Next.js frontend, and CRE workflow for periodic compliance and pricing checks.';
    const model = (process.env.SMOKE_MODEL || 'GEMINI').trim();
    const chain = 'BASE';
    const contractId = `smoke-cre-${Date.now()}`;
    const generateTimeoutMs = Number(process.env.SMOKE_GENERATE_TIMEOUT_MS || 15 * 60 * 1000);
    const deployTimeoutMs = Number(process.env.SMOKE_DEPLOY_TIMEOUT_MS || 20 * 60 * 1000);
    const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS || 5000);
    const artifactPath = (process.env.SMOKE_ARTIFACT_PATH || '').trim();
    const endpoint = `${baseUrl}/api/v1/generate`;

    console.log(`[CRE smoke] generate endpoint: ${endpoint}`);
    console.log(`[CRE smoke] contract id: ${contractId}`);
    console.log(`[CRE smoke] chain: ${chain}, model: ${model}`);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
    };
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const generateResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            contract_id: contractId,
            instruction,
            chain,
            model,
        }),
    });

    if (!generateResponse.ok) {
        const body = await generateResponse.text();
        throw new Error(
            `Generate request failed with status ${generateResponse.status}: ${body.slice(0, 500)}`,
        );
    }

    await readSseUntilEnd(generateResponse, generateTimeoutMs);
    console.log('[CRE smoke] generation stream reached END');

    const deployment = await waitForDeployment(contractId, deployTimeoutMs, pollIntervalMs);
    console.log(
        `[CRE smoke] deployment completed with status=${deployment.latestDeployment?.status || 'n/a'} tx=${deployment.latestDeployment?.txSignature || 'n/a'}`,
    );

    if (deployment.latestDeployment?.status !== 'success') {
        throw new Error(
            `Deployment failed: ${JSON.stringify(deployment.latestDeployment?.metadata || {}, null, 2)}`,
        );
    }

    if (
        !deployment.latestDeployment?.metadata ||
        typeof deployment.latestDeployment.metadata !== 'object'
    ) {
        throw new Error('Deployment metadata is missing');
    }

    const metadata = deployment.latestDeployment.metadata as Record<string, unknown>;
    const workflow = metadata.workflow as Record<string, unknown> | undefined;
    const metadataContractAddress = (metadata.contractAddress as string | undefined) || null;
    const deploySucceeded = metadata.contractDeploySucceeded;

    if (!workflow?.id || typeof workflow.id !== 'string') {
        throw new Error('Deployment metadata is missing workflow.id');
    }
    if (deploySucceeded !== true) {
        throw new Error('Deployment metadata contractDeploySucceeded is not true');
    }
    if (!ensureAddress(metadataContractAddress)) {
        throw new Error('Deployment metadata contractAddress is not a valid non-zero EVM address');
    }

    if (deployment.chain !== 'BASE') {
        throw new Error(`Contract chain mismatch. Expected BASE, got ${deployment.chain}`);
    }
    if (!deployment.deployed) {
        throw new Error('Contract record is not marked deployed');
    }
    if (!ensureAddress(deployment.programId)) {
        throw new Error('Contract programId is not a valid non-zero EVM address');
    }

    if (artifactPath) {
        await writeArtifact(artifactPath, {
            timestamp: new Date().toISOString(),
            contractId,
            chain: deployment.chain,
            deployed: deployment.deployed,
            contractAddress: metadataContractAddress,
            programId: deployment.programId,
            latestDeployment: {
                id: deployment.latestDeployment?.id || null,
                network: deployment.latestDeployment?.network || null,
                status: deployment.latestDeployment?.status || null,
                txSignature: deployment.latestDeployment?.txSignature || null,
            },
            workflowId: workflow.id,
            metadata,
        });
    }

    console.log('[CRE smoke] success: single prompt -> generation -> deploy validated on Base');
}

void main().catch((error) => {
    console.error('[CRE smoke] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { spawn } from 'child_process';
import { Request, Response } from 'express';
import ResponseWriter from '../../class/response_writer';
import env from '../../configs/config.env';
import {
    CreDeployPreflightResult,
    runCreDeployPreflight,
    runCreStartupPreflight,
} from '../../chains/base/cre_adapter';

interface BinaryCheck {
    available: boolean;
    output?: string;
    error?: string;
}

function hasTruthy(value?: string): boolean {
    if (!value) return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

async function checkBinary(command: string, args: string[]): Promise<BinaryCheck> {
    return new Promise((resolve) => {
        const child = spawn(command, args, { env: process.env });
        let output = '';

        const collect = (chunk: Buffer) => {
            output += chunk.toString();
        };

        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (error) => {
            resolve({
                available: false,
                error: error.message,
            });
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve({
                    available: true,
                    output: output.trim(),
                });
                return;
            }
            resolve({
                available: false,
                error: output.trim() || `exit code ${code}`,
            });
        });
    });
}

export default async function getCreHealthController(_req: Request, res: Response) {
    const checks: string[] = [];
    const errors: string[] = [];
    const creCliPath = (env.SERVER_CRE_CLI_PATH || '').trim() || 'cre';
    const simulateOnly = hasTruthy(env.SERVER_CRE_SIMULATE_ONLY);

    let startupPreflight: CreDeployPreflightResult | null = null;
    try {
        startupPreflight = await runCreStartupPreflight();
        checks.push('startup preflight checks passed');
    } catch (error) {
        errors.push(error instanceof Error ? error.message : 'startup preflight failed');
    }

    const creCliCheck = await checkBinary(creCliPath, ['version']);
    const forgeCheck = await checkBinary('forge', ['--version']);
    if (!creCliCheck.available) {
        errors.push(`cre CLI unavailable: ${creCliCheck.error || 'unknown error'}`);
    } else {
        checks.push('cre CLI binary available');
    }
    if (!forgeCheck.available) {
        if (simulateOnly) {
            checks.push('forge unavailable (ignored in simulate-only mode)');
        } else {
            errors.push(`forge unavailable: ${forgeCheck.error || 'unknown error'}`);
        }
    } else {
        checks.push('forge binary available');
    }

    let strictPreflight: CreDeployPreflightResult | null = null;
    try {
        strictPreflight = await runCreDeployPreflight({
            cwd: process.cwd(),
            requireAuth: true,
            requirePrivateKey: !simulateOnly,
            requireForge: !simulateOnly,
            requireDeployAccess: !simulateOnly,
            requireDependencyRuntime: true,
        });
        checks.push(
            simulateOnly
                ? 'strict simulation preflight checks passed'
                : 'strict deploy preflight checks passed',
        );
    } catch (error) {
        errors.push(
            error instanceof Error
                ? error.message
                : simulateOnly
                  ? 'strict simulation preflight failed'
                  : 'strict deploy preflight failed',
        );
    }

    const runnerMode =
        strictPreflight?.runnerMode ||
        startupPreflight?.runnerMode ||
        ((env.SERVER_CRE_RUNNER_MODE || 'prebuilt').trim().toLowerCase() === 'dynamic'
            ? 'dynamic'
            : 'prebuilt');
    const preflightPassed = !!strictPreflight;
    const releaseSha = (env.SERVER_RELEASE_SHA || '').trim() || null;

    ResponseWriter.custom(res, preflightPassed ? 200 : 503, {
        success: preflightPassed,
        message: preflightPassed
            ? 'CRE deploy readiness checks passed'
            : 'CRE deploy readiness checks failed',
        data: {
            preflightPassed,
            readiness: preflightPassed ? 'ready' : 'not-ready',
            releaseSha,
            startupPrecheckRequired: hasTruthy(env.SERVER_CRE_STARTUP_PRECHECK_REQUIRED),
            simulateOnlyMode: simulateOnly,
            runnerMode,
            cliVersion: strictPreflight?.cliVersion || startupPreflight?.cliVersion || null,
            minCliVersion:
                strictPreflight?.minCliVersion ||
                startupPreflight?.minCliVersion ||
                (env.SERVER_CRE_CLI_MIN_VERSION || '').trim() ||
                null,
            diagnostics: {
                checkCount: Array.from(
                    new Set([
                        ...(startupPreflight?.checks || []),
                        ...(strictPreflight?.checks || []),
                        ...checks,
                    ]),
                ).length,
                errorCount: Array.from(new Set(errors)).length,
            },
        },
        meta: {
            timestamp: new Date().toISOString(),
        },
    });
}

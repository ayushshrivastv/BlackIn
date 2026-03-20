/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import env from '../../configs/config.env';
import { FileContent } from '@lighthouse/types';
import { parseCreDeployAccessStatus, type CreDeployAccessStatus } from './cre_deploy_access_parser';
import { hasVerifiedLinkedOwnerAddress } from './cre_linked_keys_parser';
export type { CreDeployAccessStatus } from './cre_deploy_access_parser';

export type BaseNetwork = 'base-sepolia' | 'base-mainnet';
export type CreRunnerMode = 'prebuilt' | 'dynamic';

type CreTarget = 'staging-settings' | 'production-settings';
type CommandEnv = Record<string, string | undefined>;

interface RunCommandOptions {
    cwd: string;
    env: CommandEnv;
    onProgress?: (line: string) => Promise<void> | void;
    stdin?: string;
    timeoutMs?: number;
}

export interface CreWorkflowStep {
    id: string;
    type: 'trigger' | 'compute' | 'action';
    description: string;
}

export interface CreWorkflow {
    chain: 'BASE';
    network: BaseNetwork;
    target: CreTarget;
    steps: CreWorkflowStep[];
}

export interface CreGenerationExecutionResult {
    workflowId: string;
    chain: 'BASE';
    network: BaseNetwork;
    summary: string;
    steps: Array<CreWorkflowStep & { status: CreDeployStepStatus }>;
    preflight?: CreDeployPreflightResult;
    logs?: string[];
    raw?: unknown;
}

export interface CreDeployedContract {
    name: string;
    address: string;
}

export type CreDeployStepName = 'preflight' | 'foundry' | 'simulate' | 'deploy' | 'activate';
export type CreDeployStepStatus = 'success' | 'failed' | 'skipped';

export interface CreDeployStepResult {
    step: CreDeployStepName;
    status: CreDeployStepStatus;
    detail: string;
}

export interface CreDeployPreflightResult {
    cliVersion: string;
    minCliVersion: string;
    deployAccess: CreDeployAccessStatus;
    runnerMode: CreRunnerMode;
    checks: string[];
}

export interface CreDeployExecutionResult {
    workflowId: string;
    workflowName?: string;
    chain: 'BASE';
    network: BaseNetwork;
    txHash?: string;
    explorerUrl?: string;
    registryTxHash?: string;
    registryExplorerUrl?: string;
    binaryUrl?: string;
    configUrl?: string;
    contracts: CreDeployedContract[];
    contractDeploySucceeded: boolean;
    preflight: CreDeployPreflightResult;
    steps: CreDeployStepResult[];
    metadata: Record<string, unknown>;
    logs: string[];
    summary: string;
    raw?: unknown;
}

export interface CreDeployExecutionInput {
    contractId: string;
    network: BaseNetwork;
    files: FileContent[];
    onProgress?: (line: string) => Promise<void> | void;
}

interface FoundryDeployResult {
    txHash?: string;
    explorerUrl?: string;
    contract?: CreDeployedContract;
    logs: string[];
}

interface CreDeployMetadata {
    workflowId?: string;
    workflowName?: string;
    txHash?: string;
    explorerUrl?: string;
    binaryUrl?: string;
    configUrl?: string;
}

interface EnsureProjectResult {
    workflowDir: string;
    workflowDirRelative: string;
    envPath: string;
    target: CreTarget;
}

interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
}

const DEFAULT_CRE_WORKFLOW_DIR = 'cre/base-runtime-workflow';
const DEFAULT_PREBUILT_NODE_MODULES_PATH = '/opt/lighthouse/cre-workflow/node_modules';
const DEFAULT_MIN_CRE_CLI_VERSION = '1.2.0';
const DEFAULT_MIN_MAINNET_BALANCE_WEI = '1';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const HEVM_ADDRESS = '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d';

function normalizePrivateKey(value: string): string {
    const trimmed = value.trim();
    const withoutPrefix = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[a-fA-F0-9]{64}$/.test(withoutPrefix)) {
        throw new Error('Invalid CRE private key format. Expected 64 hex characters.');
    }
    return withoutPrefix;
}

function sanitizePath(filePath: string): string {
    const normalized = path.posix.normalize(filePath).replace(/^\/+/g, '');
    if (!normalized || normalized === '.' || normalized.startsWith('..')) {
        throw new Error(`unsafe file path in generated files: ${filePath}`);
    }
    return normalized;
}

function resolveTarget(network: BaseNetwork): CreTarget {
    return network === 'base-mainnet' ? 'production-settings' : 'staging-settings';
}

function resolveChainSelectorName(network: BaseNetwork): string {
    return network === 'base-mainnet'
        ? 'ethereum-mainnet-base-1'
        : 'ethereum-testnet-sepolia-base-1';
}

function resolveCreCliPath(): string {
    return (env.SERVER_CRE_CLI_PATH || '').trim() || 'cre';
}

function resolveRequiredCliMinVersion(): string {
    return (env.SERVER_CRE_CLI_MIN_VERSION || '').trim() || DEFAULT_MIN_CRE_CLI_VERSION;
}

function resolveRunnerMode(): CreRunnerMode {
    const normalized = (env.SERVER_CRE_RUNNER_MODE || '').trim().toLowerCase();
    return normalized === 'dynamic' ? 'dynamic' : 'prebuilt';
}

function resolvePrebuiltNodeModulesPath(): string {
    return (
        (env.SERVER_CRE_PREBUILT_NODE_MODULES_PATH || '').trim() ||
        DEFAULT_PREBUILT_NODE_MODULES_PATH
    );
}

function resolveRawPrivateKey(): string {
    return (
        (env.SERVER_CRE_ETH_PRIVATE_KEY || '').trim() ||
        (env.SERVER_BASE_DEPLOYER_PRIVATE_KEY || '').trim()
    );
}

function resolveApiKey(): string {
    return (env.SERVER_CRE_API_KEY || '').trim();
}

function resolveEthereumMainnetRpcUrl(): string {
    return (
        (env.SERVER_ETHEREUM_MAINNET_RPC_URL || '').trim() || 'https://ethereum-rpc.publicnode.com'
    );
}

function resolveMinimumMainnetBalanceWei(): bigint {
    const configuredBalanceWei = (env.SERVER_CRE_MIN_MAINNET_BALANCE_WEI || '').trim();
    const raw = configuredBalanceWei || DEFAULT_MIN_MAINNET_BALANCE_WEI;
    if (!/^\d+$/.test(raw)) {
        throw new Error(
            `Invalid SERVER_CRE_MIN_MAINNET_BALANCE_WEI value "${raw}". Expected an integer wei value.`,
        );
    }
    return BigInt(raw);
}

function resolveBaseRpcUrl(network: BaseNetwork): string {
    if (network === 'base-mainnet') {
        return (env.SERVER_BASE_MAINNET_RPC_URL || '').trim() || 'https://mainnet.base.org';
    }

    return (env.SERVER_BASE_SEPOLIA_RPC_URL || '').trim() || 'https://sepolia.base.org';
}

function parseDeployMetadata(output: string): CreDeployMetadata {
    const workflowId =
        output.match(/Workflow\s+ID:\s*([^\n\r]+)/i)?.[1]?.trim() ||
        output.match(/Workflow\s+Id:\s*([^\n\r]+)/i)?.[1]?.trim();
    const workflowName = output.match(/Workflow\s+Name:\s*([^\n\r]+)/i)?.[1]?.trim();
    const txHash =
        output.match(/Transaction\s+hash:\s*(0x[a-fA-F0-9]{64})/i)?.[1]?.trim() ||
        output.match(/Transaction:\s*(0x[a-fA-F0-9]{64})/i)?.[1]?.trim();
    const explorerUrl = output.match(/View\s+on\s+explorer:\s*(https?:\/\/[^\s]+)/i)?.[1]?.trim();
    const binaryUrl = output.match(/Binary\s+URL:\s*(https?:\/\/[^\s]+)/i)?.[1]?.trim();
    const configUrl = output.match(/Config\s+URL:\s*(https?:\/\/[^\s]+)/i)?.[1]?.trim();

    return {
        workflowId,
        workflowName,
        txHash,
        explorerUrl,
        binaryUrl,
        configUrl,
    };
}

function escapeShellArg(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function resolveDeployAccessStatus(options: {
    cwd: string;
    commandEnv: CommandEnv;
    creCliPath: string;
    onProgress?: (line: string) => Promise<void> | void;
}): Promise<{ status: CreDeployAccessStatus; checks: string[] }> {
    const { cwd, commandEnv, creCliPath, onProgress } = options;
    const checks: string[] = [];

    const whoamiOutput = await runCommand(creCliPath, ['whoami'], {
        cwd,
        env: commandEnv,
        onProgress,
    });
    const whoamiStatus = parseCreDeployAccessStatus(whoamiOutput);
    checks.push(`whoami deploy access: ${whoamiStatus}`);
    if (whoamiStatus !== 'unknown') {
        return { status: whoamiStatus, checks };
    }

    if (onProgress) {
        await onProgress('CRE preflight: checking deploy access with `cre account access`...');
    }

    const accessOutput = await runCommand(
        'sh',
        ['-lc', `printf 'n\\n' | ${escapeShellArg(creCliPath)} account access`],
        {
            cwd,
            env: commandEnv,
            onProgress,
            timeoutMs: 10000,
        },
    );
    const accessStatus = parseCreDeployAccessStatus(accessOutput);
    checks.push(`account access status: ${accessStatus}`);

    return { status: accessStatus, checks };
}

function parseAddressFromOutput(output: string): string {
    const address = output.match(/0x[a-fA-F0-9]{40}/)?.[0];
    if (!address) {
        throw new Error(`Unable to derive wallet address from CLI output: ${output.trim()}`);
    }
    return address.toLowerCase();
}

function parseWeiFromBalanceOutput(output: string): bigint {
    const normalized = output.trim().replace(/,/g, '');
    if (!normalized) {
        throw new Error('Unable to parse wallet balance: empty output.');
    }

    const firstToken = normalized.split(/\s+/)[0];
    if (/^0x[a-fA-F0-9]+$/.test(firstToken)) {
        return BigInt(firstToken);
    }
    if (/^\d+$/.test(firstToken)) {
        return BigInt(firstToken);
    }

    const fallback = normalized.match(/\d+/)?.[0];
    if (!fallback) {
        throw new Error(`Unable to parse wallet balance from output: ${output.trim()}`);
    }
    return BigInt(fallback);
}

async function resolveDeployerAddress(options: {
    privateKeyNoPrefix: string;
    cwd: string;
    commandEnv: CommandEnv;
    onProgress?: (line: string) => Promise<void> | void;
}): Promise<string> {
    const { privateKeyNoPrefix, cwd, commandEnv, onProgress } = options;
    const output = await runCommand(
        'cast',
        ['wallet', 'address', '--private-key', `0x${privateKeyNoPrefix}`],
        {
            cwd,
            env: commandEnv,
            onProgress,
        },
    );
    return parseAddressFromOutput(output);
}

async function verifyLinkedKeyForAddress(options: {
    deployerAddress: string;
    creCliPath: string;
    cwd: string;
    commandEnv: CommandEnv;
    onProgress?: (line: string) => Promise<void> | void;
}) {
    const { deployerAddress, creCliPath, cwd, commandEnv, onProgress } = options;
    const output = await runCommand(creCliPath, ['account', 'list-key'], {
        cwd,
        env: commandEnv,
        onProgress,
    });

    if (!hasVerifiedLinkedOwnerAddress(output, deployerAddress)) {
        throw new Error(
            `CRE linked-key check failed: ${deployerAddress} is not linked and verified. Run \`cre account link-key --target production-settings\`.`,
        );
    }
}

async function ensureFundedMainnetWallet(options: {
    deployerAddress: string;
    minimumBalanceWei: bigint;
    cwd: string;
    commandEnv: CommandEnv;
    onProgress?: (line: string) => Promise<void> | void;
}) {
    const { deployerAddress, minimumBalanceWei, cwd, commandEnv, onProgress } = options;
    const output = await runCommand(
        'cast',
        ['balance', deployerAddress, '--rpc-url', resolveEthereumMainnetRpcUrl()],
        {
            cwd,
            env: commandEnv,
            onProgress,
        },
    );
    const balanceWei = parseWeiFromBalanceOutput(output);
    if (balanceWei < minimumBalanceWei) {
        throw new Error(
            `CRE wallet funding check failed: ${deployerAddress} has ${balanceWei} wei on Ethereum Mainnet, requires at least ${minimumBalanceWei} wei.`,
        );
    }
}

function toWorkflowSlug(contractId: string): string {
    return `lighthouse-${contractId.slice(-12).toLowerCase()}`;
}

function renderProjectYaml(): string {
    const baseSepoliaRpc = resolveBaseRpcUrl('base-sepolia');
    const baseMainnetRpc = resolveBaseRpcUrl('base-mainnet');
    const ethereumMainnetRpc = resolveEthereumMainnetRpcUrl();
    const ownerAddress = (env.SERVER_CRE_WORKFLOW_OWNER_ADDRESS || '').trim();

    const ownerSection = ownerAddress
        ? `  account:\n    workflow-owner-address: "${ownerAddress}"\n`
        : '';

    return `staging-settings:\n${ownerSection}  rpcs:\n    - chain-name: ethereum-testnet-sepolia-base-1\n      url: ${baseSepoliaRpc}\n    - chain-name: ethereum-mainnet\n      url: ${ethereumMainnetRpc}\n\nproduction-settings:\n${ownerSection}  rpcs:\n    - chain-name: ethereum-mainnet-base-1\n      url: ${baseMainnetRpc}\n    - chain-name: ethereum-mainnet\n      url: ${ethereumMainnetRpc}\n`;
}

function renderSecretsYaml(): string {
    return `secretsNames:
  complianceApiKey:
    - COMPLIANCE_API_KEY
`;
}

function renderWorkflowYaml(workflowSlug: string): string {
    return `staging-settings:\n  user-workflow:\n    workflow-name: "${workflowSlug}-staging"\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.staging.json"\n    secrets-path: "../../secrets.yaml"\n\nproduction-settings:\n  user-workflow:\n    workflow-name: "${workflowSlug}-production"\n  workflow-artifacts:\n    workflow-path: "./main.ts"\n    config-path: "./config.production.json"\n    secrets-path: "../../secrets.yaml"\n`;
}

function renderWorkflowPackageJson(): string {
    return `{
  "name": "base-runtime-workflow",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@chainlink/cre-sdk": "1.0.7",
    "viem": "2.39.0",
    "zod": "3.24.1"
  }
}
`;
}

function renderWorkflowTsconfig(): string {
    return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["./**/*.ts"]
}
`;
}

function renderWorkflowMainTs(): string {
    return `import {
  CronCapability,
  ConfidentialHTTPClient,
  EVMClient,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  encodeCallMsg,
  handler,
  json,
  getNetwork,
  ok,
  type Runtime,
} from "@chainlink/cre-sdk"
import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, zeroAddress } from "viem"
import { z } from "zod"

type Config = {
  schedule: string
  chainSelectorName: string
  contractAddress: string
  workflowOwner: string
  complianceApiUrl: string
  marketDataUrl: string
}

const appAbi = parseAbi(["function promptSummary() view returns (string)"])
const complianceSchema = z.object({
  status: z.string(),
  score: z.number().optional(),
  policyId: z.string().optional(),
})
const marketSchema = z.object({
  source: z.string().optional(),
  value: z.number().optional(),
})

const runComplianceCheck = (runtime: Runtime<Config>) => {
  if (!runtime.config.complianceApiUrl || !runtime.config.workflowOwner) {
    return null
  }

  const confidentialHttp = new ConfidentialHTTPClient()
  const response = confidentialHttp
    .sendRequest(runtime, {
      request: {
        url: runtime.config.complianceApiUrl,
        method: "GET",
        multiHeaders: {
          Authorization: { values: ["Bearer {{.complianceApiKey}}"] },
        },
      },
      vaultDonSecrets: [{ key: "complianceApiKey", owner: runtime.config.workflowOwner }],
    })
    .result()

  if (!ok(response)) {
    throw new Error(\`Compliance request failed with status \${response.statusCode}\`)
  }

  const parsed = complianceSchema.safeParse(json(response))
  if (!parsed.success) {
    throw new Error("Compliance response is invalid")
  }

  return parsed.data
}

const fetchMarketData = (runtime: Runtime<Config>) => {
  if (!runtime.config.marketDataUrl) {
    return null
  }

  const httpClient = new HTTPClient()
  const response = httpClient
    .sendRequest(
      runtime,
      {
        url: runtime.config.marketDataUrl,
        method: "GET",
        timeout: "10s",
      },
      consensusIdenticalAggregation(),
    )(runtime.config)
    .result()

  if (!ok(response)) {
    throw new Error(\`Market data request failed with status \${response.statusCode}\`)
  }

  const parsed = marketSchema.safeParse(json(response))
  if (!parsed.success) {
    throw new Error("Market data response is invalid")
  }

  return parsed.data
}

const onCronTrigger = (runtime: Runtime<Config>): string => {
  const selectorName = runtime.config.chainSelectorName
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: selectorName,
    isTestnet: selectorName.includes("testnet"),
  })

  if (!network) {
    throw new Error(\`Network not found: \${selectorName}\`)
  }

  const configuredAddress = (runtime.config.contractAddress || zeroAddress).toLowerCase()
  let promptSummary = "Contract deployment pending"
  if (configuredAddress !== zeroAddress) {
    const evmClient = new EVMClient(network.chainSelector.selector)
    const callData = encodeFunctionData({
      abi: appAbi,
      functionName: "promptSummary",
    })

    const contractCall = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: configuredAddress as Address,
          data: callData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    promptSummary = String(
      decodeFunctionResult({
        abi: appAbi,
        functionName: "promptSummary",
        data: bytesToHex(contractCall.data),
      }),
    )
  } else {
    runtime.log("No deployed contract address configured. Continuing with compliance and market checks.")
  }

  const complianceResult = runComplianceCheck(runtime)
  const marketData = fetchMarketData(runtime)

  const result = {
    contractPromptSummary: promptSummary,
    compliance: complianceResult,
    marketData,
  }

  runtime.log(\`Institutional workflow result: \${JSON.stringify(result)}\`)
  return JSON.stringify(result)
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
`;
}

function defaultWorkflowConfig(network: BaseNetwork, contractAddress: string) {
    return {
        schedule: network === 'base-mainnet' ? '0 */5 * * * *' : '*/30 * * * * *',
        chainSelectorName: resolveChainSelectorName(network),
        contractAddress,
        workflowOwner: (env.SERVER_CRE_WORKFLOW_OWNER_ADDRESS || '').trim(),
        complianceApiUrl: 'https://example.com/api/compliance/check',
        marketDataUrl: 'https://example.com/api/market/data',
    };
}

function trimOutputLines(output: string, limit: number): string[] {
    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-limit);
}

function isZeroAddress(address?: string | null): boolean {
    if (!address) return true;
    return address.toLowerCase() === ZERO_ADDRESS;
}

function parseSemver(version: string): ParsedSemver | null {
    const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return null;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

function parseCliVersion(output: string): string {
    const parsed = parseSemver(output);
    if (!parsed) {
        throw new Error(`Unable to parse CRE CLI version from output: ${output.trim()}`);
    }

    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function parseRunnerMode(value?: string): CreRunnerMode {
    if (!value) return 'prebuilt';
    return value.trim().toLowerCase() === 'dynamic' ? 'dynamic' : 'prebuilt';
}

async function writeWorkspaceFiles(rootDir: string, files: FileContent[]) {
    for (const file of files) {
        const safePath = sanitizePath(file.path);
        const absolutePath = path.join(rootDir, safePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, file.content, 'utf8');
    }
}

async function runCommand(
    command: string,
    args: string[],
    options: RunCommandOptions,
): Promise<string> {
    const { cwd, env: commandEnv, onProgress, stdin, timeoutMs } = options;

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: commandEnv,
        });

        let output = '';
        let finished = false;

        const finishWithError = (error: Error) => {
            if (finished) return;
            finished = true;
            reject(error);
        };

        const finishWithSuccess = () => {
            if (finished) return;
            finished = true;
            resolve(output);
        };

        const pipeOutput = (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;
            if (onProgress) {
                void onProgress(chunk.trimEnd());
            }
        };

        let timeout: ReturnType<typeof setTimeout> | undefined;
        if (timeoutMs && timeoutMs > 0) {
            timeout = setTimeout(() => {
                child.kill('SIGTERM');
                finishWithError(
                    new Error(
                        `${command} ${args.join(' ')} timed out after ${timeoutMs}ms\n${output}`,
                    ),
                );
            }, timeoutMs);
        }

        child.stdout.on('data', pipeOutput);
        child.stderr.on('data', pipeOutput);

        if (typeof stdin === 'string') {
            child.stdin.write(stdin);
        }
        child.stdin.end();

        child.on('error', (error) => finishWithError(error));
        child.on('close', (code) => {
            if (timeout) clearTimeout(timeout);

            if (code === 0) {
                finishWithSuccess();
                return;
            }

            finishWithError(
                new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${output}`),
            );
        });
    });
}

async function findFoundryScript(rootDir: string): Promise<string | null> {
    const scriptDir = path.join(rootDir, 'contracts', 'script');

    try {
        const entries = await fs.readdir(scriptDir, { withFileTypes: true });
        const match = entries.find(
            (entry) => entry.isFile() && /^Deploy.*\.s\.sol$/.test(entry.name),
        );
        return match ? path.join(scriptDir, match.name) : null;
    } catch {
        return null;
    }
}

function parseFoundryDeployResult(
    scriptPath: string,
    output: string,
    network: BaseNetwork,
): FoundryDeployResult {
    const txHash = output.match(/0x[a-fA-F0-9]{64}/g)?.[0];
    const addresses = (output.match(/0x[a-fA-F0-9]{40}/g) || []).filter(
        (address) => address.toLowerCase() !== HEVM_ADDRESS,
    );
    const uniqueAddresses = Array.from(new Set(addresses));
    const primaryAddress = uniqueAddresses[0];
    const contractName =
        path.basename(scriptPath, '.s.sol').replace(/^Deploy/, '') || 'BaseContract';

    const explorerUrl = txHash
        ? network === 'base-mainnet'
            ? `https://basescan.org/tx/${txHash}`
            : `https://sepolia.basescan.org/tx/${txHash}`
        : undefined;

    return {
        txHash,
        explorerUrl,
        contract: primaryAddress
            ? {
                  name: contractName,
                  address: primaryAddress,
              }
            : undefined,
        logs: trimOutputLines(output, 120),
    };
}

async function deployContractWithFoundryStrict(
    rootDir: string,
    network: BaseNetwork,
    privateKeyWithPrefix: string,
    commandEnv: CommandEnv,
    onProgress?: (line: string) => Promise<void> | void,
): Promise<FoundryDeployResult> {
    const scriptPath = await findFoundryScript(rootDir);
    if (!scriptPath) {
        throw new Error(
            'Foundry deployment failed: expected contracts/script/Deploy*.s.sol for Base deployment.',
        );
    }

    const contractsRoot = path.join(rootDir, 'contracts');
    const relativeScriptPath = path.relative(contractsRoot, scriptPath);
    const scriptContractName = path.basename(relativeScriptPath, '.s.sol');
    const scriptTarget = `${relativeScriptPath}:${scriptContractName}`;
    const rpcUrl = resolveBaseRpcUrl(network);

    if (onProgress) {
        await onProgress(`Foundry deploy: running ${scriptTarget} on ${network}...`);
    }

    const output = await runCommand(
        'forge',
        [
            'script',
            scriptTarget,
            '--root',
            contractsRoot,
            '--rpc-url',
            rpcUrl,
            '--broadcast',
            '--private-key',
            privateKeyWithPrefix,
            '-vvvv',
        ],
        {
            cwd: contractsRoot,
            env: commandEnv,
            onProgress,
        },
    );

    const parsed = parseFoundryDeployResult(scriptPath, output, network);
    if (!parsed.contract || isZeroAddress(parsed.contract.address)) {
        throw new Error(
            'Foundry deployment failed: no valid contract address was produced for Base deployment.',
        );
    }

    return parsed;
}

async function ensureFileExists(
    absolutePath: string,
    defaultContent: string,
    onProgress?: (line: string) => Promise<void> | void,
) {
    try {
        await fs.access(absolutePath);
        if (onProgress) {
            await onProgress(
                `CRE scaffold preserved existing file: ${path.basename(absolutePath)}.`,
            );
        }
        return;
    } catch {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, defaultContent, 'utf8');
        if (onProgress) {
            await onProgress(`CRE scaffold created missing file: ${path.basename(absolutePath)}.`);
        }
    }
}

function patchWorkflowConfigContent(
    existingContent: string | null,
    network: BaseNetwork,
    contractAddress: string,
): string {
    let parsed: Record<string, unknown> = {};

    if (existingContent) {
        try {
            const loaded = JSON.parse(existingContent);
            if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
                parsed = loaded as Record<string, unknown>;
            }
        } catch {
            parsed = {};
        }
    }

    if (!parsed.schedule || typeof parsed.schedule !== 'string') {
        parsed.schedule = defaultWorkflowConfig(network, contractAddress).schedule;
    }

    parsed.chainSelectorName = resolveChainSelectorName(network);
    parsed.contractAddress = contractAddress;

    return JSON.stringify(parsed, null, 2);
}

async function patchWorkflowConfigFile(
    absolutePath: string,
    network: BaseNetwork,
    contractAddress: string,
    onProgress?: (line: string) => Promise<void> | void,
) {
    let existing: string | null = null;
    try {
        existing = await fs.readFile(absolutePath, 'utf8');
    } catch {
        existing = null;
    }

    const patched = patchWorkflowConfigContent(existing, network, contractAddress);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${patched}\n`, 'utf8');

    if (onProgress) {
        await onProgress(`CRE workflow config patched: ${path.basename(absolutePath)}.`);
    }
}

async function ensureCreProjectFiles(
    rootDir: string,
    contractId: string,
    network: BaseNetwork,
    contractAddress: string,
    privateKeyNoPrefix: string | undefined,
    apiKey: string,
    onProgress?: (line: string) => Promise<void> | void,
): Promise<EnsureProjectResult> {
    const workflowDir = path.join(rootDir, DEFAULT_CRE_WORKFLOW_DIR);
    await fs.mkdir(workflowDir, { recursive: true });

    const workflowSlug = toWorkflowSlug(contractId);

    await ensureFileExists(path.join(rootDir, 'project.yaml'), renderProjectYaml(), onProgress);
    await ensureFileExists(path.join(rootDir, 'secrets.yaml'), renderSecretsYaml(), onProgress);
    await ensureFileExists(
        path.join(workflowDir, 'workflow.yaml'),
        renderWorkflowYaml(workflowSlug),
        onProgress,
    );
    await ensureFileExists(path.join(workflowDir, 'main.ts'), renderWorkflowMainTs(), onProgress);
    await ensureFileExists(
        path.join(workflowDir, 'package.json'),
        renderWorkflowPackageJson(),
        onProgress,
    );
    await ensureFileExists(
        path.join(workflowDir, 'tsconfig.json'),
        renderWorkflowTsconfig(),
        onProgress,
    );

    await patchWorkflowConfigFile(
        path.join(workflowDir, 'config.staging.json'),
        'base-sepolia',
        contractAddress,
        onProgress,
    );
    await patchWorkflowConfigFile(
        path.join(workflowDir, 'config.production.json'),
        'base-mainnet',
        contractAddress,
        onProgress,
    );

    const envFileContents = [
        privateKeyNoPrefix ? `CRE_ETH_PRIVATE_KEY=${privateKeyNoPrefix}` : '',
        apiKey ? `CRE_API_KEY=${apiKey}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    await fs.writeFile(path.join(rootDir, '.env'), `${envFileContents}\n`, 'utf8');

    return {
        workflowDir,
        workflowDirRelative: DEFAULT_CRE_WORKFLOW_DIR,
        envPath: path.join(rootDir, '.env'),
        target: resolveTarget(network),
    };
}

function buildCreEnv(apiKey: string, privateKeyNoPrefix?: string): CommandEnv {
    const envValues: CommandEnv = {
        ...process.env,
        CRE_API_KEY: apiKey,
    };
    if (privateKeyNoPrefix) {
        envValues.CRE_ETH_PRIVATE_KEY = privateKeyNoPrefix;
    }
    return envValues;
}

async function ensureWorkflowDependencies(
    workflowDir: string,
    commandEnv: CommandEnv,
    onProgress?: (line: string) => Promise<void> | void,
) {
    const runnerMode = resolveRunnerMode();
    const nodeModulesPath = path.join(workflowDir, 'node_modules');

    if (runnerMode === 'prebuilt') {
        const prebuiltNodeModulesPath = resolvePrebuiltNodeModulesPath();
        try {
            await fs.access(prebuiltNodeModulesPath);
        } catch {
            throw new Error(
                `SERVER_CRE_RUNNER_MODE=prebuilt requires prebuilt dependencies at ${prebuiltNodeModulesPath}`,
            );
        }

        try {
            await fs.access(nodeModulesPath);
            if (onProgress) {
                await onProgress('CRE workflow dependencies resolved from existing node_modules.');
            }
            return;
        } catch {
            await fs.symlink(prebuiltNodeModulesPath, nodeModulesPath, 'dir');
            if (onProgress) {
                await onProgress(
                    `CRE workflow dependencies linked from prebuilt path ${prebuiltNodeModulesPath}.`,
                );
            }
            return;
        }
    }

    try {
        await fs.access(nodeModulesPath);
        if (onProgress) {
            await onProgress('CRE workflow dependencies already installed.');
        }
        return;
    } catch {
        if (onProgress) {
            await onProgress('Installing CRE workflow dependencies with npm (dynamic mode)...');
        }
    }

    await runCommand('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: workflowDir,
        env: commandEnv,
        onProgress,
    });
}

async function getCreCliVersion(
    creCliPath: string,
    cwd: string,
    commandEnv: CommandEnv,
    onProgress?: (line: string) => Promise<void> | void,
): Promise<string> {
    const versionOutput = await runCommand(creCliPath, ['version'], {
        cwd,
        env: commandEnv,
        onProgress,
    });
    return parseCliVersion(versionOutput);
}

function ensureMinimumCliVersion(current: string, minimum: string) {
    const currentParsed = parseSemver(current);
    const minimumParsed = parseSemver(minimum);

    if (!currentParsed || !minimumParsed) {
        throw new Error(
            `Invalid CRE CLI version comparison. current=${current}, minimum=${minimum}`,
        );
    }

    if (compareSemver(currentParsed, minimumParsed) < 0) {
        throw new Error(
            `Unsupported CRE CLI version ${current}. Required minimum version is ${minimum}.`,
        );
    }
}

export async function runCreDeployPreflight(options?: {
    cwd?: string;
    requireAuth?: boolean;
    requirePrivateKey?: boolean;
    requireForge?: boolean;
    requireDeployAccess?: boolean;
    requireLinkedKey?: boolean;
    requireFundedWallet?: boolean;
    requireDependencyRuntime?: boolean;
    onProgress?: (line: string) => Promise<void> | void;
}): Promise<CreDeployPreflightResult> {
    const cwd = options?.cwd || process.cwd();
    const requireAuth = options?.requireAuth ?? true;
    const requirePrivateKey = options?.requirePrivateKey ?? true;
    const requireForge = options?.requireForge ?? true;
    const requireDeployAccess = options?.requireDeployAccess ?? true;
    const requireLinkedKey = options?.requireLinkedKey ?? requireDeployAccess;
    const requireFundedWallet = options?.requireFundedWallet ?? requireDeployAccess;
    const requireDependencyRuntime = options?.requireDependencyRuntime ?? true;
    const onProgress = options?.onProgress;

    const apiKey = resolveApiKey();
    if (requireAuth && !apiKey) {
        throw new Error('SERVER_CRE_API_KEY is required for headless CRE deploy execution.');
    }

    const rawPrivateKey = resolveRawPrivateKey();
    if (requirePrivateKey && !rawPrivateKey) {
        throw new Error(
            'SERVER_CRE_ETH_PRIVATE_KEY (or SERVER_BASE_DEPLOYER_PRIVATE_KEY) is required.',
        );
    }
    const privateKeyNoPrefix = rawPrivateKey ? normalizePrivateKey(rawPrivateKey) : undefined;
    const commandEnv = buildCreEnv(apiKey, privateKeyNoPrefix);
    const runnerMode = parseRunnerMode(env.SERVER_CRE_RUNNER_MODE);
    const checks: string[] = [];
    const creCliPath = resolveCreCliPath();
    const minCliVersion = resolveRequiredCliMinVersion();

    if (onProgress) {
        await onProgress('CRE preflight: checking CLI availability and version...');
    }
    const cliVersion = await getCreCliVersion(creCliPath, cwd, commandEnv, onProgress);
    ensureMinimumCliVersion(cliVersion, minCliVersion);
    checks.push(`CRE CLI version ${cliVersion} (>= ${minCliVersion})`);

    if (requireForge) {
        if (onProgress) {
            await onProgress('CRE preflight: checking forge availability...');
        }
        await runCommand('forge', ['--version'], {
            cwd,
            env: commandEnv,
            onProgress,
        });
        checks.push('Foundry forge binary available');
    }

    if (requireDependencyRuntime && runnerMode === 'prebuilt') {
        const prebuiltNodeModulesPath = resolvePrebuiltNodeModulesPath();
        await fs.access(prebuiltNodeModulesPath);
        checks.push(`Prebuilt workflow dependencies available at ${prebuiltNodeModulesPath}`);
    } else {
        checks.push(
            requireDependencyRuntime
                ? 'Dynamic workflow dependency mode enabled'
                : 'Dependency runtime checks skipped',
        );
    }

    let deployAccess: CreDeployAccessStatus = 'unknown';
    if (requireAuth) {
        if (onProgress) {
            await onProgress('CRE preflight: validating authentication and deploy access...');
        }
        const deployAccessResult = await resolveDeployAccessStatus({
            cwd,
            commandEnv,
            creCliPath,
            onProgress,
        });
        deployAccess = deployAccessResult.status;
        checks.push(...deployAccessResult.checks);
    } else {
        checks.push('Authentication checks skipped');
    }

    if (requireDeployAccess && deployAccess !== 'enabled') {
        throw new Error(
            `CRE deploy access is ${deployAccess}. Run \`cre account access\` to request access.`,
        );
    }

    if ((requireLinkedKey || requireFundedWallet) && !privateKeyNoPrefix) {
        throw new Error(
            'SERVER_CRE_ETH_PRIVATE_KEY (or SERVER_BASE_DEPLOYER_PRIVATE_KEY) is required for linked-key and funding checks.',
        );
    }

    if (requireLinkedKey || requireFundedWallet) {
        const deployerAddress = await resolveDeployerAddress({
            privateKeyNoPrefix: privateKeyNoPrefix as string,
            cwd,
            commandEnv,
            onProgress,
        });

        if (requireLinkedKey) {
            if (onProgress) {
                await onProgress('CRE preflight: validating linked owner key...');
            }
            await verifyLinkedKeyForAddress({
                deployerAddress,
                creCliPath,
                cwd,
                commandEnv,
                onProgress,
            });
            checks.push(`Linked key verified for deployer ${deployerAddress}`);
        }

        if (requireFundedWallet) {
            if (onProgress) {
                await onProgress('CRE preflight: validating Ethereum mainnet wallet balance...');
            }
            const minimumBalanceWei = resolveMinimumMainnetBalanceWei();
            await ensureFundedMainnetWallet({
                deployerAddress,
                minimumBalanceWei,
                cwd,
                commandEnv,
                onProgress,
            });
            checks.push(
                `Ethereum mainnet funding verified for ${deployerAddress} (>= ${minimumBalanceWei} wei)`,
            );
        }
    }

    return {
        cliVersion,
        minCliVersion,
        deployAccess,
        runnerMode,
        checks,
    };
}

export async function runCreStartupPreflight(): Promise<CreDeployPreflightResult> {
    return runCreDeployPreflight({
        cwd: process.cwd(),
        requireAuth: false,
        requireForge: false,
        requirePrivateKey: false,
        requireDeployAccess: false,
        requireDependencyRuntime: false,
    });
}

export function composeCreWorkflow(
    userPrompt: string,
    network: BaseNetwork = 'base-sepolia',
): CreWorkflow {
    const target = resolveTarget(network);

    return {
        chain: 'BASE',
        network,
        target,
        steps: [
            {
                id: 'trigger-user-prompt',
                type: 'trigger',
                description: `Capture prompt and derive app scope: ${userPrompt.slice(0, 120)}`,
            },
            {
                id: 'compute-workflow-simulation',
                type: 'compute',
                description: `Simulate CRE workflow against target ${target} before deployment.`,
            },
            {
                id: 'action-workflow-deploy',
                type: 'action',
                description: `Deploy and activate CRE workflow using target ${target}.`,
            },
        ],
    };
}

export async function executeCreGenerationWorkflow(
    instruction: string,
    network: BaseNetwork = 'base-sepolia',
): Promise<CreGenerationExecutionResult> {
    const workflow = composeCreWorkflow(instruction, network);
    const steps: Array<CreWorkflowStep & { status: CreDeployStepStatus }> = [];

    const preflight = await runCreDeployPreflight({
        cwd: process.cwd(),
        requireAuth: true,
        requirePrivateKey: false,
        requireForge: false,
        requireDeployAccess: false,
    });
    steps.push(
        ...workflow.steps.map((step, index) => ({
            ...step,
            status: index === 0 ? ('success' as const) : ('skipped' as const),
        })),
    );

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lighthouse-cre-generation-'));
    try {
        const commandEnv = buildCreEnv(resolveApiKey());
        const generationContractId = `generation-${Date.now()}`;
        const creProject = await ensureCreProjectFiles(
            tmpRoot,
            generationContractId,
            network,
            ZERO_ADDRESS,
            undefined,
            resolveApiKey(),
        );
        await ensureWorkflowDependencies(creProject.workflowDir, commandEnv);

        const simulateOutput = await runCommand(
            resolveCreCliPath(),
            [
                'workflow',
                'simulate',
                creProject.workflowDirRelative,
                '--target',
                creProject.target,
                '--non-interactive',
                '--trigger-index',
                '0',
                '--project-root',
                tmpRoot,
                '--env',
                creProject.envPath,
            ],
            {
                cwd: tmpRoot,
                env: commandEnv,
            },
        );

        steps[1].status = 'success';
        steps[2].status = 'skipped';

        return {
            workflowId: `cre-plan-${Date.now()}`,
            chain: 'BASE',
            network,
            summary:
                'CRE generation workflow simulated successfully with official CRE CLI on Base.',
            steps,
            preflight,
            logs: trimOutputLines(simulateOutput, 80),
            raw: {
                target: workflow.target,
                chainSelectorName: resolveChainSelectorName(network),
                outputs: {
                    simulateOutput,
                },
            },
        };
    } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true });
    }
}

export async function executeCreDeployWorkflow(
    payload: CreDeployExecutionInput,
): Promise<CreDeployExecutionResult> {
    const workflow = composeCreWorkflow(
        `Deploy contract ${payload.contractId} to ${payload.network}`,
        payload.network,
    );
    const steps: CreDeployStepResult[] = [];

    let preflight: CreDeployPreflightResult;
    try {
        preflight = await runCreDeployPreflight({
            cwd: process.cwd(),
            requireDeployAccess: true,
            onProgress: payload.onProgress,
        });
        steps.push({
            step: 'preflight',
            status: 'success',
            detail: `CRE CLI ${preflight.cliVersion}, deploy access ${preflight.deployAccess}, runner mode ${preflight.runnerMode}.`,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown preflight error';
        steps.push({
            step: 'preflight',
            status: 'failed',
            detail: message,
        });
        throw new Error(`CRE preflight failed: ${message}`);
    }

    const rawPrivateKey = resolveRawPrivateKey();
    const privateKeyNoPrefix = normalizePrivateKey(rawPrivateKey);
    const privateKeyWithPrefix = `0x${privateKeyNoPrefix}`;
    const apiKey = resolveApiKey();
    const creCliPath = resolveCreCliPath();

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lighthouse-cre-runtime-'));

    try {
        await writeWorkspaceFiles(tmpRoot, payload.files);

        const commandEnv = buildCreEnv(apiKey, privateKeyNoPrefix);

        let foundryDeploy: FoundryDeployResult;
        try {
            foundryDeploy = await deployContractWithFoundryStrict(
                tmpRoot,
                payload.network,
                privateKeyWithPrefix,
                commandEnv,
                payload.onProgress,
            );
            steps.push({
                step: 'foundry',
                status: 'success',
                detail: `Contract deployed at ${foundryDeploy.contract?.address}.`,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'unknown foundry deployment error';
            steps.push({
                step: 'foundry',
                status: 'failed',
                detail: message,
            });
            throw new Error(message);
        }

        const contractAddress = foundryDeploy.contract?.address;
        if (!contractAddress || isZeroAddress(contractAddress)) {
            throw new Error('Foundry deployment failed: invalid deployed contract address.');
        }

        const creProject = await ensureCreProjectFiles(
            tmpRoot,
            payload.contractId,
            payload.network,
            contractAddress,
            privateKeyNoPrefix,
            apiKey,
            payload.onProgress,
        );

        await ensureWorkflowDependencies(creProject.workflowDir, commandEnv, payload.onProgress);

        let simulateOutput = '';
        try {
            if (payload.onProgress) {
                await payload.onProgress(
                    `CRE simulate: running workflow simulation on target ${creProject.target}...`,
                );
            }
            simulateOutput = await runCommand(
                creCliPath,
                [
                    'workflow',
                    'simulate',
                    creProject.workflowDirRelative,
                    '--target',
                    creProject.target,
                    '--non-interactive',
                    '--trigger-index',
                    '0',
                    '--project-root',
                    tmpRoot,
                    '--env',
                    creProject.envPath,
                ],
                {
                    cwd: tmpRoot,
                    env: commandEnv,
                    onProgress: payload.onProgress,
                },
            );
            steps.push({
                step: 'simulate',
                status: 'success',
                detail: `Workflow simulation completed on ${creProject.target}.`,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown simulation error';
            steps.push({
                step: 'simulate',
                status: 'failed',
                detail: message,
            });
            throw new Error(message);
        }

        let deployOutput = '';
        try {
            if (payload.onProgress) {
                await payload.onProgress(
                    `CRE deploy: deploying workflow on target ${creProject.target}...`,
                );
            }
            deployOutput = await runCommand(
                creCliPath,
                [
                    'workflow',
                    'deploy',
                    creProject.workflowDirRelative,
                    '--target',
                    creProject.target,
                    '--yes',
                    '--project-root',
                    tmpRoot,
                    '--env',
                    creProject.envPath,
                ],
                {
                    cwd: tmpRoot,
                    env: commandEnv,
                    onProgress: payload.onProgress,
                },
            );
            steps.push({
                step: 'deploy',
                status: 'success',
                detail: `Workflow deploy completed on ${creProject.target}.`,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown deploy error';
            steps.push({
                step: 'deploy',
                status: 'failed',
                detail: message,
            });
            throw new Error(message);
        }

        let activateOutput = '';
        try {
            if (payload.onProgress) {
                await payload.onProgress('CRE activate: activating deployed workflow...');
            }
            activateOutput = await runCommand(
                creCliPath,
                [
                    'workflow',
                    'activate',
                    creProject.workflowDirRelative,
                    '--target',
                    creProject.target,
                    '--yes',
                    '--project-root',
                    tmpRoot,
                    '--env',
                    creProject.envPath,
                ],
                {
                    cwd: tmpRoot,
                    env: commandEnv,
                    onProgress: payload.onProgress,
                },
            );
            steps.push({
                step: 'activate',
                status: 'success',
                detail: `Workflow activation completed on ${creProject.target}.`,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown activate error';
            steps.push({
                step: 'activate',
                status: 'failed',
                detail: message,
            });
            throw new Error(message);
        }

        const deployMetadata = parseDeployMetadata(deployOutput);
        const consolidatedLogs = [
            ...(foundryDeploy.logs || []),
            ...trimOutputLines(simulateOutput, 40),
            ...trimOutputLines(deployOutput, 60),
            ...trimOutputLines(activateOutput, 40),
        ].slice(-240);

        const metadata: Record<string, unknown> = {
            workflow: {
                id: deployMetadata.workflowId || `cre-${payload.contractId}-${Date.now()}`,
                name: deployMetadata.workflowName || null,
            },
            target: creProject.target,
            chainSelectorName: resolveChainSelectorName(payload.network),
            contractAddress,
            contractDeploySucceeded: true,
            runnerMode: preflight.runnerMode,
            steps,
            preflight,
        };

        return {
            workflowId: (metadata.workflow as { id: string }).id,
            workflowName: deployMetadata.workflowName,
            chain: 'BASE',
            network: payload.network,
            txHash: foundryDeploy.txHash,
            explorerUrl: foundryDeploy.explorerUrl,
            registryTxHash: deployMetadata.txHash,
            registryExplorerUrl: deployMetadata.explorerUrl,
            binaryUrl: deployMetadata.binaryUrl,
            configUrl: deployMetadata.configUrl,
            contracts: foundryDeploy.contract ? [foundryDeploy.contract] : [],
            contractDeploySucceeded: true,
            preflight,
            steps,
            metadata,
            logs: consolidatedLogs,
            summary: `CRE workflow simulated, deployed, and activated on ${creProject.target}.`,
            raw: {
                workflow,
                target: creProject.target,
                chainSelectorName: resolveChainSelectorName(payload.network),
                foundryDeploy,
                deployMetadata,
                preflight,
                steps,
                outputs: {
                    simulateOutput,
                    deployOutput,
                    activateOutput,
                },
            },
        };
    } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true });
    }
}

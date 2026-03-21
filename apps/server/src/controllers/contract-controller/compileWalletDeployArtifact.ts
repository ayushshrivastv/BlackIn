/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import path from 'path';
import { Chain, prisma } from '@lighthouse/database';
import { Request, Response } from 'express';
import z from 'zod';
import ResponseWriter from '../../class/response_writer';
import { objectStore } from '../../services/init';
import { FileContent } from '../../types/content_types';

type SolcDiagnostic = {
    formattedMessage?: string;
    message?: string;
    severity?: 'warning' | 'error';
};

type SolcOutput = {
    contracts?: Record<
        string,
        Record<
            string,
            {
                abi?: unknown[];
                evm?: {
                    bytecode?: { object?: string };
                };
            }
        >
    >;
    errors?: SolcDiagnostic[];
};

type SolcModule = {
    compile: (input: string) => string;
    version: () => string;
};

const paramsSchema = z.object({
    contractId: z.string().min(1),
});

const bodySchema = z.object({
    files: z
        .array(
            z.object({
                path: z.string().min(1).max(512),
                content: z.string().max(1_500_000),
            }),
        )
        .max(500)
        .optional(),
    entryFile: z.string().min(1).max(512).optional(),
    contractName: z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .optional(),
    optimizerRuns: z.number().int().min(1).max(1_000_000).optional(),
});

const CONTRACT_DECLARATION_REGEX = /^\s*(?:abstract\s+)?contract\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;

function normalizeSourcePath(rawPath: string) {
    const normalized = path.posix.normalize(
        rawPath.replace(/\\/g, '/').replace(/^\.\//, '').trim(),
    );
    if (!normalized || normalized === '.' || normalized.includes('\0')) {
        throw new Error(`Invalid source path: ${rawPath}`);
    }
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
        throw new Error(`Unsafe source path: ${rawPath}`);
    }
    return normalized;
}

function addAlias(sourceMap: Map<string, string>, alias: string, content: string) {
    if (!alias || sourceMap.has(alias)) return;
    sourceMap.set(alias, content);
}

function buildSourceMap(files: FileContent[]) {
    const sourceMap = new Map<string, string>();

    for (const file of files) {
        if (!file.path.endsWith('.sol')) continue;

        const normalizedPath = normalizeSourcePath(file.path);
        sourceMap.set(normalizedPath, file.content);

        if (normalizedPath.startsWith('contracts/')) {
            addAlias(sourceMap, normalizedPath.slice('contracts/'.length), file.content);
        }
        if (normalizedPath.startsWith('node_modules/')) {
            addAlias(sourceMap, normalizedPath.slice('node_modules/'.length), file.content);
        }

        const directLibMatch = normalizedPath.match(/^lib\/([^/]+)\/src\/(.+)$/);
        if (directLibMatch) {
            const [, packageName, relativePath] = directLibMatch;
            addAlias(sourceMap, `${packageName}/${relativePath}`, file.content);
            if (
                packageName.startsWith('openzeppelin-contracts') &&
                relativePath.startsWith('contracts/')
            ) {
                addAlias(sourceMap, `@openzeppelin/${relativePath}`, file.content);
            }
        }

        const contractsLibMatch = normalizedPath.match(/^contracts\/lib\/([^/]+)\/src\/(.+)$/);
        if (contractsLibMatch) {
            const [, packageName, relativePath] = contractsLibMatch;
            addAlias(sourceMap, `${packageName}/${relativePath}`, file.content);
            if (
                packageName.startsWith('openzeppelin-contracts') &&
                relativePath.startsWith('contracts/')
            ) {
                addAlias(sourceMap, `@openzeppelin/${relativePath}`, file.content);
            }
        }
    }

    return sourceMap;
}

function extractContractNames(content: string) {
    const names: string[] = [];
    CONTRACT_DECLARATION_REGEX.lastIndex = 0;
    let match = CONTRACT_DECLARATION_REGEX.exec(content);
    while (match) {
        names.push(match[1]);
        match = CONTRACT_DECLARATION_REGEX.exec(content);
    }
    return names;
}

function pickEntryFile(sourceMap: Map<string, string>, requestedEntryFile?: string) {
    const solidityFiles = [...sourceMap.keys()].filter((key) => key.endsWith('.sol'));
    if (!solidityFiles.length) {
        throw new Error('No Solidity files found in this contract workspace');
    }

    if (requestedEntryFile) {
        const normalizedRequested = normalizeSourcePath(requestedEntryFile);
        if (!sourceMap.has(normalizedRequested)) {
            throw new Error(`Entry file not found: ${normalizedRequested}`);
        }
        return normalizedRequested;
    }

    const sourceCandidates = solidityFiles.filter(
        (filePath) =>
            filePath.includes('/src/') &&
            !filePath.includes('/script/') &&
            !filePath.includes('/test/') &&
            !filePath.endsWith('.t.sol'),
    );

    if (sourceCandidates.length) return sourceCandidates[0];
    return solidityFiles[0];
}

function withHexPrefix(value: string) {
    return value.startsWith('0x') ? value : `0x${value}`;
}

function loadSolcModule(): SolcModule {
    const solc = require('solc') as SolcModule;
    return solc;
}

export default async function compileWalletDeployArtifact(req: Request, res: Response) {
    const user = req.user;
    if (!user?.id) {
        ResponseWriter.unauthorized(res);
        return;
    }

    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
        ResponseWriter.validation_error(res, 'Invalid contractId path parameter');
        return;
    }

    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
        ResponseWriter.validation_error(
            res,
            parsedBody.error.issues[0]?.message || 'Invalid compile request payload',
        );
        return;
    }

    const { contractId } = parsedParams.data;
    const { files: inlineFiles, entryFile, contractName, optimizerRuns } = parsedBody.data;

    try {
        const contract = await prisma.contract.findUnique({
            where: {
                id: contractId,
                userId: user.id,
                chain: Chain.BASE,
            },
            select: { id: true },
        });

        if (!contract) {
            ResponseWriter.not_found(res, 'Contract not found');
            return;
        }

        const sourceFiles = inlineFiles?.length
            ? inlineFiles
            : await objectStore.get_resource_files(contract.id);
        const sourceMap = buildSourceMap(sourceFiles);
        if (!sourceMap.size) {
            ResponseWriter.validation_error(
                res,
                'No Solidity sources found. Generate Solidity files first.',
            );
            return;
        }

        const selectedEntryFile = pickEntryFile(sourceMap, entryFile);
        const solc = loadSolcModule();

        const input = {
            language: 'Solidity',
            sources: Object.fromEntries(
                [...sourceMap.entries()].map(([filePath, content]) => [filePath, { content }]),
            ),
            settings: {
                optimizer: {
                    enabled: true,
                    runs: optimizerRuns ?? 200,
                },
                outputSelection: {
                    '*': {
                        '*': ['abi', 'evm.bytecode.object'],
                    },
                },
            },
        };

        let compileOutput: SolcOutput;
        try {
            compileOutput = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;
        } catch (compileError) {
            ResponseWriter.server_error(
                res,
                'Solidity compiler execution failed',
                compileError instanceof Error ? compileError.message : 'Unknown compiler error',
            );
            return;
        }

        const diagnostics = compileOutput.errors || [];
        const compileErrors = diagnostics
            .filter((item) => item.severity === 'error')
            .map((item) => item.formattedMessage || item.message || 'Unknown compiler error');
        const compileWarnings = diagnostics
            .filter((item) => item.severity === 'warning')
            .map((item) => item.formattedMessage || item.message || 'Compiler warning');

        if (compileErrors.length) {
            ResponseWriter.custom(res, 422, {
                success: false,
                message: 'Solidity compilation failed',
                error: {
                    code: 'SOLIDITY_COMPILE_FAILED',
                    details: compileErrors.slice(0, 8).join('\n\n'),
                },
                meta: {
                    timestamp: new Date().toISOString(),
                },
            });
            return;
        }

        const allContracts = compileOutput.contracts || {};
        const entryContracts = allContracts[selectedEntryFile] || {};
        const entryContent = sourceMap.get(selectedEntryFile) || '';
        const declaredInEntry = extractContractNames(entryContent);

        const deploymentCandidateNames = declaredInEntry.length
            ? declaredInEntry
            : Object.keys(entryContracts);
        const requestedContractName = contractName?.trim();

        let selectedContractSource = selectedEntryFile;
        let selectedContractName = requestedContractName || '';

        if (requestedContractName) {
            const entryMatch = entryContracts[requestedContractName];
            if (entryMatch) {
                selectedContractName = requestedContractName;
            } else {
                for (const [sourcePath, contractsByName] of Object.entries(allContracts)) {
                    if (contractsByName[requestedContractName]) {
                        selectedContractSource = sourcePath;
                        selectedContractName = requestedContractName;
                        break;
                    }
                }
            }
        }

        if (!selectedContractName) {
            const firstDeployableInEntry = deploymentCandidateNames.find((name) => {
                const candidate = entryContracts[name];
                const bytecode = candidate?.evm?.bytecode?.object || '';
                return bytecode.length > 0;
            });

            if (firstDeployableInEntry) {
                selectedContractName = firstDeployableInEntry;
            } else {
                for (const [sourcePath, contractsByName] of Object.entries(allContracts)) {
                    const candidateName = Object.keys(contractsByName).find((name) => {
                        const bytecode = contractsByName[name]?.evm?.bytecode?.object || '';
                        return bytecode.length > 0;
                    });
                    if (candidateName) {
                        selectedContractSource = sourcePath;
                        selectedContractName = candidateName;
                        break;
                    }
                }
            }
        }

        if (!selectedContractName) {
            ResponseWriter.validation_error(
                res,
                'Compilation succeeded but no deployable contract bytecode was found.',
            );
            return;
        }

        const artifact = allContracts[selectedContractSource]?.[selectedContractName];
        const abi = artifact?.abi || [];
        const bytecodeObject = artifact?.evm?.bytecode?.object || '';
        if (!bytecodeObject) {
            ResponseWriter.validation_error(
                res,
                `Contract ${selectedContractName} has no deployable bytecode (possibly abstract/interface-only).`,
            );
            return;
        }

        ResponseWriter.success(
            res,
            {
                entryFile: selectedContractSource,
                contractName: selectedContractName,
                abi,
                bytecode: withHexPrefix(bytecodeObject),
                warnings: compileWarnings,
                compilerVersion: solc.version(),
            },
            'Compile artifact generated successfully',
        );
    } catch (error) {
        ResponseWriter.server_error(
            res,
            'Internal server error',
            error instanceof Error ? error.message : undefined,
        );
    }
}

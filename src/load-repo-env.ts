import fs from 'fs';
import path from 'path';

const ENV_FILE_ORDER = ['.env.example', '.env', '.env.local'] as const;

function stripInlineComment(value: string): string {
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];

        if (character === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (character === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }

        if (character === '#' && !inSingleQuote && !inDoubleQuote) {
            return value.slice(0, index).trim();
        }
    }

    return value.trim();
}

function normalizeEnvValue(value: string): string {
    const trimmedValue = stripInlineComment(value);

    if (
        (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
        (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
    ) {
        return trimmedValue.slice(1, -1);
    }

    return trimmedValue;
}

function parseEnvFile(filePath: string): Record<string, string> {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const parsed: Record<string, string> = {};

    for (const rawLine of fileContents.split(/\r?\n/u)) {
        const line = rawLine.trim();

        if (!line || line.startsWith('#')) {
            continue;
        }

        const normalizedLine = line.startsWith('export ') ? line.slice(7) : line;
        const separatorIndex = normalizedLine.indexOf('=');

        if (separatorIndex === -1) {
            continue;
        }

        const key = normalizedLine.slice(0, separatorIndex).trim();
        if (!key) {
            continue;
        }

        const rawValue = normalizedLine.slice(separatorIndex + 1);
        parsed[key] = normalizeEnvValue(rawValue);
    }

    return parsed;
}

function hasWorkspaceMarker(dir: string): boolean {
    return fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'));
}

export function findWorkspaceRoot(startDir: string): string {
    let currentDir = path.resolve(startDir);

    while (true) {
        if (hasWorkspaceMarker(currentDir)) {
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return path.resolve(startDir);
        }

        currentDir = parentDir;
    }
}

export function getRepoEnvPaths(startDir: string): string[] {
    const workspaceRoot = findWorkspaceRoot(startDir);

    return ENV_FILE_ORDER.map((fileName) => path.join(workspaceRoot, fileName)).filter((filePath) =>
        fs.existsSync(filePath),
    );
}

export function loadRepoEnv(startDir: string): string[] {
    const envPaths = getRepoEnvPaths(startDir);
    const mergedEnv: Record<string, string> = {};

    for (const envPath of envPaths) {
        const parsed = parseEnvFile(envPath);
        Object.assign(mergedEnv, parsed);
    }

    for (const [key, value] of Object.entries(mergedEnv)) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }

    return envPaths;
}

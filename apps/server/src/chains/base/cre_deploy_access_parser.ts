/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

export type CreDeployAccessStatus = 'enabled' | 'disabled' | 'unknown';

export function parseCreDeployAccessStatus(output: string): CreDeployAccessStatus {
    const normalized = output.toLowerCase();
    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        const lowered = line.toLowerCase();
        if (!lowered.includes('deploy')) continue;
        if (!lowered.includes('access')) continue;

        if (
            /\b(enabled|approved|granted|allowlisted|allowed|yes|true)\b/i.test(line) &&
            !/\bnot\b/i.test(line)
        ) {
            return 'enabled';
        }
        if (/\b(disabled|not enabled|pending|denied|blocked|rejected|no|false)\b/i.test(line)) {
            return 'disabled';
        }
    }

    if (normalized.includes('deployment access is enabled')) return 'enabled';
    if (normalized.includes('deployment access is not yet enabled')) return 'disabled';
    if (normalized.includes('deploy access is enabled')) return 'enabled';
    if (normalized.includes('deploy access is not enabled')) return 'disabled';

    return 'unknown';
}

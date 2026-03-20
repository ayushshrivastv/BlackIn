/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

export interface CreLinkedOwnerRecord {
    address: string;
    status: string | null;
}

export function parseCreLinkedOwnerRecords(output: string): CreLinkedOwnerRecord[] {
    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const owners: CreLinkedOwnerRecord[] = [];
    let current: CreLinkedOwnerRecord | null = null;

    for (const line of lines) {
        const ownerMatch = line.match(/Owner Address:\s*(0x[a-fA-F0-9]{40})/i);
        if (ownerMatch) {
            if (current) {
                owners.push(current);
            }
            current = {
                address: ownerMatch[1].toLowerCase(),
                status: null,
            };
            continue;
        }

        const statusMatch = line.match(/Status:\s*([A-Za-z_]+)/i);
        if (statusMatch && current) {
            current.status = statusMatch[1];
        }
    }

    if (current) {
        owners.push(current);
    }

    return owners;
}

export function hasVerifiedLinkedOwnerAddress(output: string, address: string): boolean {
    const normalizedAddress = address.toLowerCase();
    const records = parseCreLinkedOwnerRecords(output);
    const matchingRecord = records.find((record) => record.address === normalizedAddress);
    if (!matchingRecord) return false;

    if (!matchingRecord.status) {
        return true;
    }

    return /success/i.test(matchingRecord.status);
}

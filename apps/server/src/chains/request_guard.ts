/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Response } from 'express';
import { Chain } from '@lighthouse/types';
import ResponseWriter from '../class/response_writer';
import { isChainEnabled, resolveRequestedChain } from './registry';

export function resolveAndGuardChain(res: Response, requested?: Chain): Chain | null {
    const resolved = resolveRequestedChain(requested);
    if (!isChainEnabled(resolved)) {
        ResponseWriter.error(
            res,
            `Chain ${resolved} is currently disabled by server configuration`,
            503,
            'CHAIN_DISABLED',
        );
        return null;
    }

    return resolved;
}

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import z from 'zod';

export const getContractMessagesSchema = z.object({
    contractId: z.uuid(),
});

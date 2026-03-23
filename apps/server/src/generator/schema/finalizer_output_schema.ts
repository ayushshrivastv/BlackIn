/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import z from 'zod';

export const finalizer_output_schema = z.object({
    idl: z
        .array(
            z.object({
                id: z.string().optional(),
                path: z.string(),
                type: z.string().optional(),
                content: z
                    .string()
                    .optional()
                    .describe('Short human-readable summary of what this file contains.'),
            }),
        )
        .default([]),
    context: z.string(),
});

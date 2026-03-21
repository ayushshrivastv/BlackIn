/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { Request, Response } from 'express';
import ResponseWriter from '../../class/response_writer';
import { objectStore } from '../../services/init';

export default async function getFilesController(req: Request, res: Response) {
    const contractId = req.params.contractId;

    if (!contractId) {
        ResponseWriter.error(res, 'contract-id not found', 400, 'MISSING_CONTRACT_ID');
        return;
    }

    try {
        const files = await objectStore.get_resource_files(contractId);

        ResponseWriter.success(res, files, 'Files retrieved successfully', 200);
        return;
    } catch (error) {
        console.error('Error fetching files', error);
        ResponseWriter.server_error(
            res,
            'Internal Server Error',
            error instanceof Error ? error.message : undefined,
        );
        return;
    }
}

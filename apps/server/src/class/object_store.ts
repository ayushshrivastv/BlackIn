/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import env from '../configs/config.env';
import { FileContent } from '../types/content_types';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

type ObjectStoreMode = 'aws' | 'local';

export default class ObjectStore {
    private readonly mode: ObjectStoreMode;
    private readonly localRoot: string;
    private s3: S3Client | null;
    private bucket: string;
    private cloudfront: CloudFrontClient | null;
    private distribution_id: string;

    constructor() {
        const configuredMode = (env.SERVER_OBJECT_STORE_MODE || 'local').toLowerCase();
        this.mode = configuredMode === 'aws' ? 'aws' : 'local';
        this.localRoot = path.resolve(process.cwd(), env.SERVER_OBJECT_STORE_LOCAL_ROOT);
        this.s3 = null;
        this.bucket = '';
        this.cloudfront = null;
        this.distribution_id = '';

        if (this.mode !== 'aws') {
            return;
        }

        this.s3 = new S3Client({
            region: env.SERVER_AWS_REGION,
            credentials: {
                accessKeyId: env.SERVER_AWS_ACCESS_KEY_ID,
                secretAccessKey: env.SERVER_AWS_SECRET_ACCESS_KEY,
            },
        });

        // cdn client for cache clean
        this.cloudfront = new CloudFrontClient({
            region: 'us-east-1',
            credentials: {
                accessKeyId: env.SERVER_AWS_ACCESS_KEY_ID,
                secretAccessKey: env.SERVER_AWS_SECRET_ACCESS_KEY,
            },
        });

        this.bucket = env.SERVER_AWS_BUCKET_NAME;
        this.distribution_id = env.SERVER_CLOUDFRONT_DISTRIBUTION_ID;
    }

    private assertAwsMode() {
        if (this.mode !== 'aws' || !this.s3 || !this.cloudfront) {
            throw new Error('ObjectStore AWS mode is not configured');
        }
    }

    private contractResourceFilePath(contractId: string) {
        return path.join(this.localRoot, contractId, 'resource.json');
    }

    private contractRawFilePath(contractId: string) {
        return path.join(this.localRoot, contractId, 'raw', 'llm-response.txt');
    }

    private templateResourceFilePath(templateId: string) {
        return path.join(this.localRoot, 'templates', templateId, 'resource.json');
    }

    private async ensureParentDir(filePath: string) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
    }

    private async writeJson(filePath: string, value: unknown) {
        await this.ensureParentDir(filePath);
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }

    private async readJson<T>(filePath: string): Promise<T> {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as T;
    }

    private async cleanCache(path: string) {
        if (this.mode !== 'aws') return;
        this.assertAwsMode();
        await this.cloudfront.send(
            new CreateInvalidationCommand({
                DistributionId: this.distribution_id,
                InvalidationBatch: {
                    CallerReference: Date.now().toString(),
                    Paths: {
                        Quantity: 1,
                        Items: [path],
                    },
                },
            }),
        );
    }

    public async updateContractFiles(
        contractId: string,
        updatedFiles: FileContent[],
    ): Promise<void> {
        if (this.mode === 'local') {
            await this.writeJson(this.contractResourceFilePath(contractId), updatedFiles);
            return;
        }

        try {
            this.assertAwsMode();
            const key = `${contractId}/resource`;

            const upload = new Upload({
                client: this.s3,
                params: {
                    Bucket: this.bucket,
                    Key: key, // Same key = overwrites existing file
                    Body: JSON.stringify(updatedFiles),
                    ContentType: 'application/json',
                },
            });

            await upload.done();
            await this.cleanCache(`/${key}`);
        } catch (error) {
            console.error('Failed to update contract files: ', error);
            return;
        }
    }

    public async updateContractFilesWithRaw(
        contractId: string,
        updatedFiles: FileContent[],
        rawLlmResponse?: string,
    ): Promise<void> {
        if (this.mode === 'local') {
            await this.updateContractFiles(contractId, updatedFiles);
            if (rawLlmResponse) {
                const rawPath = this.contractRawFilePath(contractId);
                await this.ensureParentDir(rawPath);
                await fs.writeFile(rawPath, rawLlmResponse, 'utf8');
            }
            return;
        }

        try {
            // Update the resource files
            await this.updateContractFiles(contractId, updatedFiles);

            // Optionally update the raw LLM response
            if (rawLlmResponse) {
                const rawKey = `${contractId}/raw/llm-response.txt`;
                const rawUpload = new Upload({
                    client: this.s3,
                    params: {
                        Bucket: this.bucket,
                        Key: rawKey,
                        Body: rawLlmResponse,
                        ContentType: 'text/plain',
                    },
                });
                await rawUpload.done();
                await this.cleanCache(`/${rawKey}`);
            }
        } catch (error) {
            console.error('Failed to update raw contract files: ', error);
            return;
        }
    }

    public async uploadContractFiles(
        contractId: string,
        files: FileContent[],
        rawLlmResponse: string,
    ): Promise<void> {
        if (this.mode === 'local') {
            await this.writeJson(this.contractResourceFilePath(contractId), files);
            const rawPath = this.contractRawFilePath(contractId);
            await this.ensureParentDir(rawPath);
            await fs.writeFile(rawPath, rawLlmResponse, 'utf8');
            return;
        }

        try {
            this.assertAwsMode();
            const key = `${contractId}/resource`;
            const upload = new Upload({
                client: this.s3,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: JSON.stringify(files),
                    ContentType: 'application/json',
                },
            });
            await upload.done();
            await this.cleanCache(`/${key}`);

            const rawKey = `${contractId}/raw/llm-response.txt`;
            const rawUpload = new Upload({
                client: this.s3,
                params: {
                    Bucket: this.bucket,
                    Key: rawKey,
                    Body: rawLlmResponse,
                    ContentType: 'text/plain',
                },
            });
            await rawUpload.done();
            await this.cleanCache(`/${rawKey}`);
        } catch (error) {
            console.error('Failed to upload contract files: ', error);
            throw error;
        }
    }

    public async uploadFile(contractId: string, path: string, content: string | Buffer) {
        if (this.mode === 'local') {
            const localFilePath = this.safeLocalFilePath(contractId, path);
            await this.ensureParentDir(localFilePath);
            await fs.writeFile(localFilePath, content);
            return localFilePath;
        }

        try {
            this.assertAwsMode();
            const key = `${contractId}/${path}`;

            const upload = new Upload({
                client: this.s3,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: content,
                },
            });

            await upload.done();
            return key;
        } catch (error) {
            console.error('Failed to upload files: ', error);
            return;
        }
    }

    public async get_template_files(templateId: string): Promise<FileContent[]> {
        if (this.mode === 'local') {
            const localPath = this.templateResourceFilePath(templateId);
            return this.readJson<FileContent[]>(localPath);
        }
        const res = await axios.get(`${this.get_template_files_path(templateId)}`);
        const template_files: FileContent[] = res.data;
        return template_files;
    }

    public async get_resource_files(contractId: string): Promise<FileContent[]> {
        if (this.mode === 'local') {
            const localPath = this.contractResourceFilePath(contractId);
            return this.readJson<FileContent[]>(localPath);
        }
        const res = await axios.get(`${this.get_resource_files_path(contractId)}`);
        const contract_files: FileContent[] = res.data;
        return contract_files;
    }

    public get_raw_files(contractId: string) {
        if (this.mode === 'local') {
            return this.contractRawFilePath(contractId);
        }
        return `${env.SERVER_CLOUDFRONT_DOMAIN}/${contractId}/raw/llm-response.txt`;
    }

    public get_template_files_path(templateId: string) {
        if (this.mode === 'local') {
            return this.templateResourceFilePath(templateId);
        }
        return `${env.SERVER_CLOUDFRONT_DOMAIN_TEMPLATES}/${templateId}/resource`;
    }

    public get_resource_files_path(contractId: string) {
        if (this.mode === 'local') {
            return this.contractResourceFilePath(contractId);
        }
        return `${env.SERVER_CLOUDFRONT_DOMAIN}/${contractId}/resource`;
    }

    private safeLocalFilePath(contractId: string, filePath: string) {
        const normalized = path.posix.normalize(filePath);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
            throw new Error(`unsafe local object store path: ${filePath}`);
        }
        return path.join(this.localRoot, contractId, normalized);
    }
}

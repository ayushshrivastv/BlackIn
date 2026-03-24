/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { buildCorsOptions } from './cors';

interface TestServer {
    url: string;
    close: () => Promise<void>;
}

async function startTestServer(nodeEnv: 'development' | 'production', allowedOrigins: string[]) {
    const app = express();
    app.use(
        cors(
            buildCorsOptions({
                nodeEnv,
                allowedOrigins,
            }),
        ),
    );
    app.options('/probe', (_req, res) => {
        res.sendStatus(204);
    });
    app.get('/probe', (_req, res) => {
        res.status(200).json({ ok: true });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Unable to determine test server address');
    }

    const testServer: TestServer = {
        url: `http://127.0.0.1:${address.port}`,
        close: async () => {
            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        },
    };

    return testServer;
}

describe('buildCorsOptions integration', () => {
    it('allows configured origin and returns credentials header', async () => {
        const server = await startTestServer('development', ['https://app.blackin.xyz']);
        try {
            const response = await fetch(`${server.url}/probe`, {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://app.blackin.xyz',
                    'Access-Control-Request-Method': 'GET',
                },
            });

            assert.equal(response.status, 204);
            assert.equal(
                response.headers.get('access-control-allow-origin'),
                'https://app.blackin.xyz',
            );
            assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
        } finally {
            await server.close();
        }
    });

    it('blocks non-allowlisted origin', async () => {
        const server = await startTestServer('development', ['https://app.blackin.xyz']);
        try {
            const response = await fetch(`${server.url}/probe`, {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://evil.example',
                    'Access-Control-Request-Method': 'GET',
                },
            });

            assert.equal(response.status, 204);
            assert.equal(response.headers.get('access-control-allow-origin'), null);
            assert.equal(response.headers.get('access-control-allow-credentials'), null);
        } finally {
            await server.close();
        }
    });

    it('throws when production runs without SERVER_CORS_ORIGINS', () => {
        assert.throws(
            () =>
                buildCorsOptions({
                    nodeEnv: 'production',
                    allowedOrigins: [],
                }),
            /SERVER_CORS_ORIGINS must be configured in production/,
        );
    });
});

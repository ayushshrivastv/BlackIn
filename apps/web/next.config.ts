/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRepoEnv } from '../../src/load-repo-env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadRepoEnv(__dirname);

const nextConfig: NextConfig = {
    reactStrictMode: false,
    eslint: {
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'd3k5vke5jsl4rb.cloudfront.net',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;

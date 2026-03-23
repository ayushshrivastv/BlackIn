/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import express from 'express';
import http from 'http';
import env from './configs/config.env';
import cors from 'cors';
import router from './routes';
import init_services from './services/init';
import { logger } from './utils/logger';
import cookieParser from 'cookie-parser';
import { buildCorsOptions } from './security/cors';

const app = express();

app.set('trust proxy', 1);

const server = http.createServer(app);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const corsOptions = buildCorsOptions({
    nodeEnv: env.SERVER_NODE_ENV,
    allowedOrigins: env.SERVER_CORS_ORIGINS,
});

app.use(cors(corsOptions));

app.use('/api/v1', router);

async function bootstrap() {
    await init_services();

    server.listen(env.SERVER_PORT, () => {
        console.warn('Server is running on port : ', env.SERVER_PORT);
    });
}

void bootstrap().catch((error) => {
    logger.error('failed to bootstrap server', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    logger.info('Shutting down server gracefully...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

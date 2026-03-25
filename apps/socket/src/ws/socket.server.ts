/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { CustomWebSocket } from '../types/socket_types';
import {
    COMMAND,
    IncomingPayload,
    TerminalSocketData,
    WSServerIncomingPayload,
} from '@lighthouse/types';
import RedisPubSub from '../queue/redis.subscriber';
import { env } from '../configs/config.env';
import CommandService from '../services/services.command';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types/auth_user';

export interface ParsedMessage<T> {
    type: COMMAND;
    payload: T;
}

export default class WebSocketServer {
    private wss: WSServer | null = null;
    public connection_mapping: Map<string, CustomWebSocket> = new Map();
    private redis: RedisPubSub;

    constructor(redis: RedisPubSub) {
        this.redis = redis;
        this.wss = new WSServer({ port: env.SOCKET_PORT });
        this.initialize_connection();
    }

    private initialize_connection() {
        if (!this.wss) return;
        this.wss.on('connection', (ws: CustomWebSocket, req_url: IncomingMessage) => {
            const { authorised, decoded, contractId } = this.authorize_user(ws, req_url);
            if (!authorised || !contractId || !decoded) {
                ws.close();
                return;
            }
            const topic = `${decoded?.id}_${contractId}`;
            this.connection_mapping.set(topic, ws);

            this.redis.subscribe(topic);
            this.add_listeners(ws, topic);
            this.send_confirmation_connection(ws, contractId);
        });
    }

    private add_listeners(ws: CustomWebSocket, topic: string) {
        ws.on('message', (message) => {
            const parsed = JSON.parse(message.toString());
            this.handle_incoming_message(ws, parsed);
        });

        ws.on('close', (code, reason) => {
            console.error('Socket closing - Code:', code, 'Reason:', reason.toString());
            this.redis.unsubscribe(topic);
            this.connection_mapping.delete(topic);
        });

        ws.on('error', () => {
            this.connection_mapping.delete(topic);
            ws.close();
        });
    }

    private async handle_incoming_message<T>(ws: CustomWebSocket, message: ParsedMessage<T>) {
        const disabledSolanaPayload = (): WSServerIncomingPayload<IncomingPayload> => ({
            type: TerminalSocketData.VALIDATION_ERROR,
            payload: {
                userId: ws.user.id,
                contractId: ws.contractId,
                // DISABLED - Solana chain (see /chains/solana).
                line: 'Solana deploy commands are disabled. Use lighthouse_DEPLOY_BASE_SEPOLIA or lighthouse_DEPLOY_BASE_MAINNET.',
                timestamp: Date.now(),
            },
        });

        switch (message.type as COMMAND) {
            case COMMAND.lighthouse_BUILD: {
                const data = await CommandService.handle_incoming_command(ws, message);
                this.send_message(ws, data);
                return;
            }
            case COMMAND.lighthouse_TEST: {
                const data = await CommandService.handle_incoming_command(ws, message);
                this.send_message(ws, data);
                return;
            }
            case COMMAND.lighthouse_DEPLOY_DEVNET: {
                this.send_message(ws, disabledSolanaPayload());
                return;
            }
            case COMMAND.lighthouse_DEPLOY_MAINNET: {
                this.send_message(ws, disabledSolanaPayload());
                return;
            }
            case COMMAND.lighthouse_DEPLOY_BASE_SEPOLIA: {
                const data = await CommandService.handle_incoming_command(ws, message);
                this.send_message(ws, data);
                return;
            }
            case COMMAND.lighthouse_DEPLOY_BASE_MAINNET: {
                const data = await CommandService.handle_incoming_command(ws, message);
                this.send_message(ws, data);
                return;
            }
            default:
                return;
        }
    }

    public send_message<T>(ws: CustomWebSocket, message: WSServerIncomingPayload<T>) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    private authorize_user(
        ws: CustomWebSocket,
        req: IncomingMessage,
    ): {
        authorised: boolean;
        decoded: AuthUser | null;
        contractId: string | null;
    } {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        const contract_id = url.searchParams.get('contractId');
        const isDevAccessMode =
            env.SERVER_NODE_ENV !== 'production' ||
            ['1', 'true', 'yes', 'on'].includes((env.SERVER_DEV_ACCESS_MODE || '').toLowerCase());

        if (isDevAccessMode) {
            if (!contract_id) {
                return { authorised: false, decoded: null, contractId: null };
            }
            ws.user = {
                id: 'dev-local-user',
                name: 'Local Developer',
                email: 'dev@blackin.local',
            };
            ws.contractId = contract_id;
            return { authorised: true, decoded: ws.user, contractId: contract_id };
        }

        if (!token || !contract_id) {
            console.error('No token provided');
            return { authorised: false, decoded: null, contractId: null };
        }

        let decoded: string | jwt.JwtPayload | null = null;
        try {
            decoded = jwt.verify(token, env.SOCKET_JWT_SECRET);
        } catch {
            return { authorised: false, decoded: null, contractId: null };
        }
        if (!decoded || typeof decoded === 'string') {
            return { authorised: false, decoded: null, contractId: null };
        }

        ws.user = decoded as unknown as AuthUser;
        ws.contractId = contract_id;
        return { authorised: true, decoded: ws.user, contractId: contract_id };
    }

    private send_confirmation_connection(ws: CustomWebSocket, contractId: string) {
        const data: WSServerIncomingPayload<IncomingPayload> = {
            type: TerminalSocketData.CONNECTED,
            payload: {
                userId: ws.user.id,
                contractId: contractId,
                line: 'You are now connected to the socket.',
                timestamp: Date.now(),
            },
        };
        this.send_message(ws, data);
    }
}

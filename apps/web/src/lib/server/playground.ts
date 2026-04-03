/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { GET_CHAT_URL } from '@/routes/api_routes';
import { useBuilderChatStore } from '@/src/store/code/useBuilderChatStore';
import { useCodeEditor } from '@/src/store/code/useCodeEditor';
import axios from 'axios';
import { shouldSkipAuthClient } from '../auth-bypass';

function parseWorkspaceFilesPayload(value: unknown) {
    if (!value) return null;

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
        return null;
    }

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        console.warn('Failed to parse workspace file payload', error);
        return null;
    }
}

export default class Playground {
    static async get_chat(token: string, contractId: string) {
        const { upsertMessage } = useBuilderChatStore.getState();
        const { parseFileStructure, setCollapseFileTree } = useCodeEditor.getState();
        try {
            const skipAuth = shouldSkipAuthClient();
            const authToken = skipAuth ? '' : token;
            if (!authToken && !skipAuth) return;
            const { data } = await axios.post(
                GET_CHAT_URL,
                {
                    contractId: contractId,
                },
                {
                    headers: authToken
                        ? {
                              Authorization: `Bearer ${authToken}`,
                          }
                        : undefined,
                },
            );

            const sortedMessages = [...data.data.messages].sort((a, b) => {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });

            for (let i = 0; i < sortedMessages.length; i++) {
                upsertMessage(sortedMessages[i]);
            }

            const parsedFiles = parseWorkspaceFilesPayload(
                data.data.contractFiles || data.data.templateFiles,
            );
            if (parsedFiles) {
                parseFileStructure(parsedFiles);
            }
            setCollapseFileTree(true);
        } catch (error) {
            console.error('Error while fetching chats from server: ', error);
        }
    }
}

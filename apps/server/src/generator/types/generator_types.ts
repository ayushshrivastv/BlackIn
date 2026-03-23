/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { AIMessageChunk, MessageStructure } from '@langchain/core/messages';
import { Runnable, RunnableSequence } from '@langchain/core/runnables';
import { FileContent } from '@lighthouse/types';

export type new_planner = RunnableSequence<
    {
        user_instruction: string;
    },
    {
        should_continue: boolean;
        request_scope: 'contract_only' | 'full_app' | 'frontend_only' | 'workflow_only';
        plan: string;
        contract_name: string;
        context: string;
        files_likely_affected: {
            do: 'create' | 'update' | 'delete';
            file_path: string;
            what_to_do: string;
        }[];
    }
>;

export type new_coder = Runnable<
    {
        plan: string;
        request_scope: 'contract_only' | 'full_app' | 'frontend_only' | 'workflow_only';
        files_likely_affected: {
            do: 'create' | 'update' | 'delete';
            file_path: string;
            what_to_do: string;
        }[];
    },
    AIMessageChunk<MessageStructure>
>;

export type new_finalizer = RunnableSequence<
    {
        generated_files: FileContent[];
    },
    {
        idl: Object[];
        context: string;
    }
>;

export type old_planner = RunnableSequence<
    {
        user_instruction: string;
        idl: Object[];
    },
    {
        should_continue: boolean;
        plan: string;
        context: string;
        files_likely_affected: {
            do: 'create' | 'update' | 'delete';
            file_path: string;
            what_to_do: string;
        }[];
    }
>;

export type old_coder = Runnable<
    {
        plan: string;
        contract_id: string;
        current_files_context: string;
        files_likely_affected: {
            do: 'create' | 'update' | 'delete';
            file_path: string;
            what_to_do: string;
        }[];
    },
    AIMessageChunk<MessageStructure>
>;

export type old_finalizer = RunnableSequence<
    {
        generated_files: FileContent[];
    },
    {
        idl: Object[];
        context: string;
    }
>;

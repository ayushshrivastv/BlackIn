/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { PromptTemplate } from '@langchain/core/prompts';

export const old_chat_planner_prompt = new PromptTemplate({
    template: `
You are a Solana smart contract planning agent.

Given the current project summary:
{idl}

And user instruction:
{user_instruction}

Create a change plan, context summary, and files_likely_affected for incremental edits.
Use create/update/delete actions precisely.
If request is unrelated to this software project, set should_continue to false.
`,
    inputVariables: ['idl', 'user_instruction'],
});

export const old_chat_coder_prompt = new PromptTemplate({
    template: `
You are a Solana Rust/Anchor developer.

Follow this plan:
{plan}

Use these current project files as context:
{current_files_context}

Work on these files for contract-id {contract_id}:
{files_likely_affected}

Output format must be:

<stage>Generating Code</stage>
<phase>thinking</phase>
<phase>generating</phase>
<file>path_to_file</file>
\`\`\`language
content
\`\`\`

(optional delete)
<phase>deleting</phase>
<file>path_to_file</file>

<phase>complete</phase>
<stage>Building</stage>

Default to Solana Rust/Anchor changes unless the user explicitly asks for another chain.
`,
    inputVariables: ['plan', 'contract_id', 'files_likely_affected', 'current_files_context'],
});

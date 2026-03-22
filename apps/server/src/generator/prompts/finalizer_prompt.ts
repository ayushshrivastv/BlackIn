/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { PromptTemplate } from '@langchain/core/prompts';

export const finalizer_prompt = new PromptTemplate({
    template: `
You are a finalizer agent for Base-native app generation.

Generated files:
{generated_files}

Return:
1) idl: an array of summary objects for each important generated file, each with id/path/type/content metadata.
2) context: a short, user-facing assistant reply in 1-2 brief paragraphs describing what was generated.

Focus on contracts + frontend integration readiness for Base.
- Write naturally, like a concise ChatGPT answer.
- Do not list raw file counts unless the user explicitly asked for them.
- Prefer explaining the main deliverable, tests added, and any notable limitation or scope boundary.
`,
    inputVariables: ['generated_files'],
});

export const reviewer_prompt = new PromptTemplate({
    template: `
Generated files:
{generated_files}

Validate project shape for a Base monorepo:
- apps/web
- contracts/src
- contracts/script
- contracts/test
- docs/config files

Return only changes required to make the project coherent.
`,
    inputVariables: ['generated_files'],
});

/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

export default function generatelighthouseReadme() {
    return `
# lighthouse – AI-Powered Base App Workspace

Welcome to your **lighthouse project**, an AI-assisted environment for building, editing, deploying, and interacting with **Base-native applications**.

lighthouse generates your application workspace (frontend + contracts) and lets you iterate using natural language.

---

## 🚀 Project Overview

This repository was generated and deployed using **lighthouse**, your AI-powered companion for Base development.

Your workspace may include:

- Frontend app scaffold (Next.js + OnchainKit)
- Solidity contracts (Foundry)
- Deployment scripts for Base Sepolia/Mainnet
- Environment configuration

---

## ✏️ How to Edit This Code

### 1. Edit in lighthouse (recommended)

Continue prompting to:

- Modify app logic
- Add contract features
- Regenerate tests
- Update frontend flows
- Re-deploy to Base networks

### 2. Edit locally in your IDE

\`\`\`sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Enter the project
cd <YOUR_PROJECT_NAME>

# Step 3: Install dependencies
npm install
# or
pnpm install

# Step 4: Start your local environment
npm run dev
\`\`\`
`.trim();
}

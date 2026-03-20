/*
 * Lighthouse
 * © 2026 ayushshrivastv
 */

import { FileContent } from '@lighthouse/types';

function toSnakeCase(value: string): string {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '') || 'base_app'
    );
}

function toPascalCase(value: string): string {
    return value
        .split(/[_-]/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join('');
}

export function prepareBaseMonorepoTemplate(projectName: string, prompt: string): FileContent[] {
    const safeProjectName = toSnakeCase(projectName);
    const contractName = `${safeProjectName}_contract`;
    const contractNamePascal = toPascalCase(contractName);
    const workflowSlug = `${safeProjectName}-cre-runtime`;
    const solidityEscapedPrompt = prompt
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');

    return [
        {
            path: 'README.md',
            content: `# ${safeProjectName}\n\nThis project was generated from a single prompt for Base.\n\n## Prompt\n\n${prompt}\n\n## Workspace\n\n- apps/web (Next.js + OnchainKit)\n- contracts (Foundry + Solidity)\n- cre/base-runtime-workflow (Chainlink CRE TypeScript workflow)\n`,
        },
        {
            path: 'package.json',
            content: `{
  "name": "${safeProjectName}",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "pnpm -C apps/web dev",
    "build": "pnpm -C apps/web build",
    "test": "forge test --root contracts"
  }
}`,
        },
        {
            path: '.env.example',
            content: `NEXT_PUBLIC_ONCHAINKIT_API_KEY=\nNEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=\nBASE_SEPOLIA_RPC_URL=https://sepolia.base.org\nBASE_MAINNET_RPC_URL=https://mainnet.base.org\nETHEREUM_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com\nPRIVATE_KEY=\nCRE_API_KEY=\nCRE_ETH_PRIVATE_KEY=\n`,
        },
        {
            path: 'project.yaml',
            content: `staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia-base-1
      url: https://sepolia.base.org
    - chain-name: ethereum-mainnet
      url: https://ethereum-rpc.publicnode.com

production-settings:
  rpcs:
    - chain-name: ethereum-mainnet-base-1
      url: https://mainnet.base.org
    - chain-name: ethereum-mainnet
      url: https://ethereum-rpc.publicnode.com
`,
        },
        {
            path: 'secrets.yaml',
            content: `secretsNames:
  complianceApiKey:
    - COMPLIANCE_API_KEY
`,
        },
        {
            path: 'apps/web/package.json',
            content: `{
  "name": "web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.5.9",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "@coinbase/onchainkit": "^0.37.0"
  }
}`,
        },
        {
            path: 'apps/web/app/layout.tsx',
            content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${safeProjectName}',
  description: 'Base-native app generated with BlackIn',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
        },
        {
            path: 'apps/web/app/page.tsx',
            content: `export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>${safeProjectName}</h1>
      <p>Base-native app scaffold generated from a single prompt.</p>
      <p>Next step: connect wallet + contract calls using OnchainKit.</p>
    </main>
  );
}
`,
        },
        {
            path: 'apps/web/app/globals.css',
            content: `html, body {
  margin: 0;
  padding: 0;
}
`,
        },
        {
            path: 'contracts/foundry.toml',
            content: `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
`,
        },
        {
            path: 'contracts/lib/forge-std/src/Script.sol',
            content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

address constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

abstract contract Script {
    Vm public constant vm = Vm(HEVM_ADDRESS);
}
`,
        },
        {
            path: 'contracts/lib/forge-std/src/Test.sol',
            content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "./Script.sol";

abstract contract Test is Script {
    function assertEq(string memory a, string memory b) internal pure {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), "assertEq failed");
    }
}
`,
        },
        {
            path: `contracts/src/${contractNamePascal}.sol`,
            content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ${contractNamePascal} {
    string public promptSummary;
    address public owner;

    constructor(string memory _promptSummary) {
        promptSummary = _promptSummary;
        owner = msg.sender;
    }
}
`,
        },
        {
            path: `contracts/script/Deploy${contractNamePascal}.s.sol`,
            content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {${contractNamePascal}} from "../src/${contractNamePascal}.sol";

contract Deploy${contractNamePascal} is Script {
    function run() external returns (${contractNamePascal} deployed) {
        vm.startBroadcast();
        deployed = new ${contractNamePascal}("${solidityEscapedPrompt}");
        vm.stopBroadcast();
    }
}
`,
        },
        {
            path: `contracts/test/${contractNamePascal}.t.sol`,
            content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {${contractNamePascal}} from "../src/${contractNamePascal}.sol";

contract ${contractNamePascal}Test is Test {
    function test_StoresPromptSummary() public {
        ${contractNamePascal} appContract = new ${contractNamePascal}("generated from prompt");
        assertEq(appContract.promptSummary(), "generated from prompt");
    }
}
`,
        },
        {
            path: 'cre/base-runtime-workflow/package.json',
            content: `{
  "name": "base-runtime-workflow",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@chainlink/cre-sdk": "^1.0.7",
    "viem": "^2.39.0",
    "zod": "^3.24.1"
  }
}
`,
        },
        {
            path: 'cre/base-runtime-workflow/tsconfig.json',
            content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["./**/*.ts"]
}
`,
        },
        {
            path: 'cre/base-runtime-workflow/workflow.yaml',
            content: `staging-settings:
  user-workflow:
    workflow-name: "${workflowSlug}-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: "../../secrets.yaml"

production-settings:
  user-workflow:
    workflow-name: "${workflowSlug}-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: "../../secrets.yaml"
`,
        },
        {
            path: 'cre/base-runtime-workflow/config.staging.json',
            content: `{
  "schedule": "*/30 * * * * *",
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "contractAddress": "0x0000000000000000000000000000000000000000",
  "workflowOwner": "",
  "complianceApiUrl": "https://example.com/api/compliance/check",
  "marketDataUrl": "https://example.com/api/market/data"
}
`,
        },
        {
            path: 'cre/base-runtime-workflow/config.production.json',
            content: `{
  "schedule": "0 */5 * * * *",
  "chainSelectorName": "ethereum-mainnet-base-1",
  "contractAddress": "0x0000000000000000000000000000000000000000",
  "workflowOwner": "",
  "complianceApiUrl": "https://example.com/api/compliance/check",
  "marketDataUrl": "https://example.com/api/market/data"
}
`,
        },
        {
            path: 'cre/base-runtime-workflow/main.ts',
            content: `import {
  CronCapability,
  ConfidentialHTTPClient,
  EVMClient,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  encodeCallMsg,
  getNetwork,
  handler,
  json,
  ok,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, zeroAddress } from "viem";
import { z } from "zod";

type Config = {
  schedule: string;
  chainSelectorName: string;
  contractAddress: string;
  workflowOwner: string;
  complianceApiUrl: string;
  marketDataUrl: string;
};

const appAbi = parseAbi(["function promptSummary() view returns (string)"]);
const complianceSchema = z.object({
  status: z.string(),
  score: z.number().optional(),
  policyId: z.string().optional(),
});
const marketSchema = z.object({
  source: z.string().optional(),
  value: z.number().optional(),
});

const runComplianceCheck = (runtime: Runtime<Config>) => {
  if (!runtime.config.complianceApiUrl || !runtime.config.workflowOwner) {
    return null;
  }

  const confidentialHttp = new ConfidentialHTTPClient();
  const response = confidentialHttp
    .sendRequest(runtime, {
      request: {
        url: runtime.config.complianceApiUrl,
        method: "GET",
        multiHeaders: {
          Authorization: { values: ["Bearer {{.complianceApiKey}}"] },
        },
      },
      vaultDonSecrets: [{ key: "complianceApiKey", owner: runtime.config.workflowOwner }],
    })
    .result();

  if (!ok(response)) {
    throw new Error(\`Compliance request failed with status \${response.statusCode}\`);
  }

  const parsed = complianceSchema.safeParse(json(response));
  if (!parsed.success) {
    throw new Error("Compliance response is invalid");
  }

  return parsed.data;
};

const fetchMarketData = (runtime: Runtime<Config>) => {
  if (!runtime.config.marketDataUrl) {
    return null;
  }

  const httpClient = new HTTPClient();
  const response = httpClient
    .sendRequest(
      runtime,
      {
        url: runtime.config.marketDataUrl,
        method: "GET",
        timeout: "10s",
      },
      consensusIdenticalAggregation(),
    )(runtime.config)
    .result();

  if (!ok(response)) {
    throw new Error(\`Market data request failed with status \${response.statusCode}\`);
  }

  const parsed = marketSchema.safeParse(json(response));
  if (!parsed.success) {
    throw new Error("Market data response is invalid");
  }

  return parsed.data;
};

const onCronTrigger = (runtime: Runtime<Config>): string => {
  const selectorName = runtime.config.chainSelectorName;
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: selectorName,
    isTestnet: selectorName.includes("testnet"),
  });

  if (!network) {
    throw new Error(\`Network not found: \${selectorName}\`);
  }

  const configuredAddress = (runtime.config.contractAddress || zeroAddress).toLowerCase();
  let promptSummary = "Contract deployment pending";
  if (configuredAddress !== zeroAddress) {
    const evmClient = new EVMClient(network.chainSelector.selector);
    const callData = encodeFunctionData({
      abi: appAbi,
      functionName: "promptSummary",
    });

    const contractCall = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: configuredAddress as Address,
          data: callData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();

    promptSummary = String(
      decodeFunctionResult({
        abi: appAbi,
        functionName: "promptSummary",
        data: bytesToHex(contractCall.data),
      }),
    );
  } else {
    runtime.log("No deployed contract address configured. Continuing with compliance and market checks.");
  }

  const complianceResult = runComplianceCheck(runtime);
  const marketData = fetchMarketData(runtime);
  const result = {
    contractPromptSummary: promptSummary,
    compliance: complianceResult,
    marketData,
  };

  runtime.log(\`Institutional workflow result: \${JSON.stringify(result)}\`);
  return JSON.stringify(result);
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
`,
        },
    ];
}

import {
  isHex,
  fromHex,
  createPublicClient,
  http,
  createWalletClient,
  custom,
  defineChain,
} from "viem";

import {
  anvil,
  mainnet,
  sepolia,
  cannon,
  base,
  baseSepolia,
  Chain,
} from "viem/chains";
import {
  publicActionsL1,
  walletActionsL1,
  createCartesiPublicClient,
} from "@cartesi/viem";
import { NODE_URL } from "../consts.js";

// Custom chain configuration
const customChain = defineChain({
  ...cannon,
  rpcUrls: {
    default: { http: [`${NODE_URL}/anvil`] },
  },
});

export const chains: Record<number, Chain> = {};
chains[anvil.id] = anvil;
chains[customChain.id] = customChain;
chains[sepolia.id] = sepolia;
chains[baseSepolia.id] = baseSepolia;
chains[mainnet.id] = mainnet;
chains[base.id] = base;

export function getChain(chainId: number | string): Chain | null {
  let numericChainId: number;

  if (typeof chainId === "string") {
    if (!isHex(chainId)) {
      console.error(`Invalid hex chain ID: ${chainId}`);
      return null;
    }
    numericChainId = fromHex(chainId, "number");
  } else {
    numericChainId = chainId;
  }

  const chain = chains[numericChainId];
  if (!chain) {
    console.error(`Chain not found for ID: ${numericChainId}`);
    return null;
  }

  return chain;
}

export async function getClient(chainId: number) {
  const chain = getChain(chainId);
  if (!chain) {
    console.error("Cannot create client: chain not found");
    return null;
  }
  return createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActionsL1());
}

export async function getWalletClient(chainId: number) {
  if (!window.ethereum) {
    console.error("Ethereum provider not found");
    return null;
  }

  const chain = getChain(chainId);
  if (!chain) {
    console.error("Cannot create wallet client: chain not found");
    return null;
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  }) as `0x${string}`[];

  return createWalletClient({
    account: accounts[0] as `0x${string}`,
    chain,
    transport: custom(window.ethereum),
  }).extend(walletActionsL1());
}

export async function getL2Client(nodeAddress: string) {
  if (!nodeAddress) {
    console.error("Node address not provided");
    return null;
  }
  return createCartesiPublicClient({
    transport: http(nodeAddress),
  });
}
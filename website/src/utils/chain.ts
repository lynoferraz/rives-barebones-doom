import "viem/window";
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

// Custom custom chain configuration using BLOCKCHAIN_URL
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

export function getChain(chainId: number): Chain | null;
export function getChain(chainId: string): Chain | null;
export function getChain(chainId: number | string): Chain | null {
  if (typeof chainId === "string") {
    if (!isHex(chainId)) return null;
    chainId = fromHex(chainId, "number");
  }

  const chain = chains[chainId];
  if (!chain) return null;

  return chain;
}

export async function getClient(chainId: number) {
  const chain = getChain(chainId);
  if (!chain) return null;
  return createPublicClient({
    chain: chain,
    transport: http(),
  }).extend(publicActionsL1());
}

export async function getWalletClient(chainId: number) {
  if (!window.ethereum) return null;
  const chain = getChain(chainId);
  if (!chain) return null;

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  return createWalletClient({
    account: accounts[0],
    chain: chain,
    transport: custom(window.ethereum),
  }).extend(walletActionsL1());
}

export async function getL2Client(nodeAddress: string) {
  if (!nodeAddress) return null;
  return createCartesiPublicClient({
    transport: http(nodeAddress),
  });
}
import {
  createPublicClient,
  http,
  fromHex,
  WalletClient,
  parseAbi,
} from "viem";
import "viem/window";
import { getWalletClient } from "../utils/chain.js";
import { APPLICATION_ADDRESS } from "../consts.js";

//
// Consts
//
const INPUT_BOX_ADDRESS = "0xc70074BDD26d8cF983Ca6A5b89b8db52D5850051";

const inputBoxRawAbi = [
  "function addInput(address _app, bytes payload) payable",
];

const inputBoxAbi = parseAbi(inputBoxRawAbi);

export async function connectWalletClient(chainId: number | string) {
  const chainIdNumber = typeof chainId === "string" ? fromHex(chainId as `0x${string}`, "number") : chainId;
  return await getWalletClient(chainIdNumber);
}

//
// Submit
//
export async function submitGameplay(
  walletClient: WalletClient,
  payload: `0x${string}`,
): Promise<void> {
  if (!walletClient || !walletClient.chain) {
    throw new Error("No connected wallet");
  }

  if (!window.ethereum) {
    throw new Error("No ethereum provider available");
  }

  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) as `0x${string}`;
  if (!chainIdHex) {
    throw new Error("No chain ID available");
  }

  const currentChainId = fromHex(chainIdHex, "number");
  if (currentChainId !== walletClient.chain.id) {
    throw new Error("Wallet on wrong chain");
  }

  const publicClient = createPublicClient({
    chain: walletClient.chain,
    transport: http(),
  });

  const [address] = await walletClient.requestAddresses();

  const { request } = await publicClient.simulateContract({
    account: address,
    address: INPUT_BOX_ADDRESS as `0x${string}`,
    abi: inputBoxAbi,
    functionName: "addInput",
    args: [APPLICATION_ADDRESS, payload],
    value: BigInt(0),
  });

  const txHash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

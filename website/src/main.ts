// External imports
import { toHex, isHex, decodeAbiParameters, parseAbiParameters, WalletClient, toBytes, ByteArray } from "viem";
import { Output } from "@cartesi/viem";

// Local imports
import {
  APPLICATION_ADDRESS,
  CARTRIDGES_URL,
  CHAIN_ID,
  EMULATOR_URL,
  NODE_URL,
} from "./consts.js";
import { connectWalletClient, submitGameplay } from "./lib/onchain.js";
import { getL2Client } from "./utils/chain.js";

interface EmulatorParams {
  simple?: boolean;
  autoplay?: boolean;
  tapeUrl?: string;
  args?: string;
  incardUrl?: string;
  entropy?: string;
  extra?: string;
}

interface VerificationNotice {
  user: string;
  timestamp: bigint;
  score: bigint;
  input_index: bigint;
}

type RpcFilter = {
  limit?: number;
  offset?: number;
  epochIndex?: bigint;
  inputIndex?: bigint;
  outputType?: "DelegateCallVoucher" | "Notice" | "Voucher";
  voucherAddress?: `0x${string}`;
};

async function getOutputs(
  appAddress: string,
  nodeAddress: string,
  filter?: RpcFilter,
): Promise<Output[]> {
  if (!nodeAddress) return [];
  const client = await getL2Client(nodeAddress + "/rpc");
  if (!client) return [];
  const outputResponse = await client.listOutputs({
    ...filter,
    application: appAddress,
  });
  return outputResponse.data;
}

async function getInput(
  appAddress: string,
  nodeAddress: string,
  inputIndex: bigint,
  filter?: RpcFilter,
): Promise<Uint8Array> {
  if (!nodeAddress) return new Uint8Array([]);
  const client = await getL2Client(nodeAddress + "/rpc");
  if (!client) return new Uint8Array([]);
  const inputResponse = await client.getInput({
    ...filter,
    application: appAddress,
    inputIndex
  });
  return toBytes(inputResponse.decodedData.payload);
}

function decodeVerificationNotice(output: Output): VerificationNotice | null {
  try {
    // Only process notices for leaderboard data
    const decodedData = output.decodedData as Record<string, unknown>;
    const type: string = decodedData && decodedData.type ? (decodedData.type as string) : "";

    if (type.toLowerCase() !== 'notice') {
      return null;
    }

    const payload = decodedData && decodedData.payload ? (decodedData.payload as string) : "";

    if (!isHex(payload)) {
      return null;
    }

    // Try to decode as verification notice
    const decoded = decodeAbiParameters(
      parseAbiParameters("address user, uint256 timestamp, int256 score, uint256 input_index"),
      payload as `0x${string}`
    );

    return {
      user: decoded[0] as string,
      timestamp: decoded[1] as bigint,
      score: decoded[2] as bigint,
      input_index: decoded[3] as bigint,
    };
  } catch (error) {
    // Not a verification notice or invalid format
    return null;
  }
}

function validateEmulatorParams(params: EmulatorParams): void {
  if (!params || typeof params !== 'object') {
    throw new Error("Invalid emulator parameters");
  }
}

/**
 * Sets the emulator iframe URL with the provided parameters
 * @param params - Configuration parameters for the emulator
 */
export function setEmulatorUrl(params: EmulatorParams): void {
  try {
    validateEmulatorParams(params);

    const emulator = document.getElementById("emulator-iframe") as HTMLIFrameElement;

    if (!emulator) {
      console.error("Emulator iframe not found");
      return;
    }

    if (!EMULATOR_URL) {
      console.error("Emulator URL not configured");
      return;
    }

    let fullSrc = `${EMULATOR_URL}/#light=100`;

    fullSrc += `&cartridge=${CARTRIDGES_URL}`;

    if (params.tapeUrl !== undefined) {
      fullSrc += `&tape=${params.tapeUrl}`;
    }

    if (params.simple !== undefined) {
      fullSrc += `&simple=${params.simple}`;
    }

    if (params.autoplay !== undefined) {
      fullSrc += `&autoplay=${params.autoplay}`;
    }

    if (params.entropy) {
      fullSrc += `&entropy=${encodeURIComponent(params.entropy)}`;
    }

    if (params.extra) {
      fullSrc += `&${params.extra}`;
    }

    emulator.src = fullSrc;
  } catch (error) {
    console.error("Error setting emulator URL:", error);
  }
}


interface WalletConnection {
  client: WalletClient | null;
  address: string | null;
}

async function getConnectedClient(): Promise<WalletConnection> {
  const msgDiv = document.getElementById("connect-msg");
  const submitMsgDiv = document.getElementById("submit-msg");

  if (submitMsgDiv) {
    submitMsgDiv.innerHTML = "";
  }

  try {
    const currClient = await connectWalletClient(CHAIN_ID);
    if (!currClient) {
      throw new Error("Error connecting wallet");
    }

    const [address] = await currClient.requestAddresses();
    updateConnectionMessage(msgDiv, address, currClient.chain.name);

    return { client: currClient, address: address };
  } catch (error) {
    console.error(error);
    handleConnectionError(msgDiv, error);
    setEmulatorUrl({ simple: true });
    return { client: null, address: null };
  }
}

function updateConnectionMessage(msgDiv: HTMLElement | null, address: string, chainName: string): void {
  if (msgDiv) {
    const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    msgDiv.innerHTML = `Connected with ${shortAddress} on ${chainName}`;
  }
}

function handleConnectionError(msgDiv: HTMLElement | null, error: unknown): void {
  let msg = "Error connecting wallet";
  if (error instanceof Error) {
    const indexDot = error.message.indexOf(".");
    msg = indexDot >= 0 ? error.message.substring(0, indexDot) : error.message;
  }
  if (msgDiv) {
    msgDiv.innerHTML = `${msg} (Demo Version)`;
  }
}

interface GameplayParams {
  rivemuOnFinish: boolean;
  outhash: string;
  tape: string;
}

async function handleGameplaySubmission(
  client: WalletClient,
  params: GameplayParams
): Promise<void> {
  const submitMsgDiv = document.getElementById("submit-msg");
  if (submitMsgDiv) {
    submitMsgDiv.innerHTML = "";
  }

  const gameplayPayload = `0x${params.outhash}${toHex(params.tape).slice(2)}`;

  if (!isHex(gameplayPayload)) {
    if (submitMsgDiv) {
      submitMsgDiv.innerHTML = "Error: Invalid payload format";
    }
    return;
  }

  try {
    await submitGameplay(client, gameplayPayload as `0x${string}`);
    if (submitMsgDiv) {
      submitMsgDiv.innerHTML = "Gameplay submitted";
    }
  } catch (error) {
    console.error(error);
    let msg = "Error submitting";
    if (error instanceof Error) {
      const indexDot = error.message.indexOf(".");
      msg = indexDot >= 0 ? error.message.substring(0, indexDot) : error.message;
    }
    if (submitMsgDiv) {
      submitMsgDiv.innerHTML = msg;
    }
  }
}

function setupWalletEventListeners(
  updateWalletConnection: () => Promise<void>
): void {
  if (window.ethereum) {
    window.ethereum.on("chainChanged", updateWalletConnection);
    window.ethereum.on("accountsChanged", updateWalletConnection);
  }
}

/**
 * Sets up wallet connection and gameplay submission functionality
 */
export async function setupSubmit(): Promise<void> {

  // connection vars
  let client: WalletClient | null;
  let userAddress: string | null;

  const updateWalletConnection = async (): Promise<void> => {
    const connectedClient = await getConnectedClient();
    client = connectedClient.client;
    userAddress = connectedClient.address;
  };

  // Set wallet event listeners
  setupWalletEventListeners(updateWalletConnection);

  // get connected wallet
  const connectedClient = await getConnectedClient();
  client = connectedClient.client;
  userAddress = connectedClient.address;

  if (!client || !userAddress) {
    return;
  }

  // set submit listener
  window.addEventListener(
    "message",
    (e) => {
      if (!client || !userAddress) return;
      const params = e.data;
      if (params.rivemuOnFinish) {
        handleGameplaySubmission(client, params);
      }
    },
    false,
  );

  // set entropy and config emulator
  const entropy = userAddress.toLowerCase();
  setEmulatorUrl({
    simple: true,
    entropy: entropy,
  });
}

function clearLeaderboardTable(table: HTMLTableElement): void {
  while (table.rows.length > 1) {
    table.deleteRow(1);
  }
}

function showLeaderboardMessage(table: HTMLTableElement, message: string, colSpan: number = 5): void {
  clearLeaderboardTable(table);
  const row = table.insertRow();
  const cell = row.insertCell();
  cell.colSpan = colSpan;
  cell.innerHTML = message;
}

function populateLeaderboardTable(table: HTMLTableElement, notices: VerificationNotice[]): void {
  clearLeaderboardTable(table);

  let rank = 1;
  for (const notice of notices) {
    const row = table.insertRow();
    if (notice.user != undefined && notice.input_index != undefined) {
      row.setAttribute('data-href', `/src/replay?user=${notice.user}&input_index=${notice.input_index}`);
      row.addEventListener('click', function() {
        if (this.dataset.href) {
          window.location.href = this.dataset.href;
        }
      });
    }
    row.insertCell().innerHTML = `${rank++}`;
    row.insertCell().innerHTML = notice.user || "Unknown";
    row.insertCell().innerHTML = timeToDateUTCString(Number(notice.timestamp));
    row.insertCell().innerHTML = `${notice.score}`;
    row.insertCell().innerHTML = `${notice.input_index}`;
  }
}

/**
 * Renders the leaderboard table with verification notices from the Cartesi node
 */
export async function renderLeaderboard(): Promise<void> {
  const table: HTMLTableElement = document.getElementById("leaderboard") as HTMLTableElement;

  if (!table) {
    console.error("Leaderboard table not found");
    return;
  }

  try {
    if (!APPLICATION_ADDRESS || !NODE_URL) {
      throw new Error("Missing application address or node URL configuration");
    }

    // Fetch all outputs from Cartesi
    const outputs = await getOutputs(APPLICATION_ADDRESS, NODE_URL);

    if (!Array.isArray(outputs)) {
      throw new Error("Invalid outputs received from node");
    }

    // Decode verification notices
    const verificationNotices: VerificationNotice[] = [];
    for (const output of outputs) {
      try {
        const notice = decodeVerificationNotice(output);
        if (notice) {
          verificationNotices.push(notice);
        }
      } catch (decodeError) {
        console.warn("Failed to decode output:", decodeError);
        // Continue processing other outputs
      }
    }

    // Sort by score (descending) and then by timestamp (ascending for earliest)
    verificationNotices.sort((a, b) => {
      const scoreDiff = Number(b.score - a.score);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a.timestamp - b.timestamp);
    });

    if (verificationNotices.length === 0) {
      showLeaderboardMessage(table, "No leaderboard data available");
      return;
    }

    // Populate table with leaderboard data
    populateLeaderboardTable(table, verificationNotices);

  } catch (error) {
    console.error("Error rendering leaderboard:", error);
    showLeaderboardMessage(table, "Error loading leaderboard data");
  }
}

/**
 * Converts a timestamp to a UTC date string
 * @param time - Unix timestamp in seconds
 * @returns Formatted date string
 */
export function timeToDateUTCString(time: number): string {
  const date = new Date(Number(time) * 1000);
  return formatDate(date);
}

/**
 * Formats a Date object to a readable string
 * @param date - Date object to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  };

  const dateString = date.toLocaleDateString("en-US", options);
  const [month_day, year, time] = dateString.split(",");
  const [month, day] = month_day.split(" ");
  const finalYear = year.substring(1);

  return `${month}/${day}/${finalYear}, ${time}`;
}

export async function setupReplay() {
  const params = new URLSearchParams(window.location.search);
  const user = params.get('user');
  const inputIndex = params.get('input_index');
  const inputData = await getInput(APPLICATION_ADDRESS, NODE_URL, BigInt(inputIndex || 0))

  const tape = inputData.slice(32);
  setEmulatorUrl({
  });

  const handleUploadedEvent = (e: MessageEvent) => {
    const params = e.data;
    if (params.rivemuUploaded) {
      const emulator = document.getElementById("emulator-iframe") as HTMLIFrameElement;
      if (emulator?.contentWindow) {
        emulator.contentWindow?.postMessage({ rivemuUpload: true, tape: tape, autoPlay: true, entropy: user?.toLowerCase() }, "*");
      }
      window.removeEventListener("message",handleUploadedEvent,false,);
    }
  }
  window.addEventListener("message",handleUploadedEvent,false,);
  
}
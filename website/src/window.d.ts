type EthereumRequestMethod =
  | 'eth_requestAccounts'
  | 'eth_chainId'
  | 'eth_accounts'
  | 'wallet_switchEthereumChain'
  | string;

interface EthereumRequestArgs {
  method: EthereumRequestMethod;
  params?: unknown[];
}

type EthereumEventType = 'chainChanged' | 'accountsChanged' | 'connect' | 'disconnect';

interface EthereumProvider {
  request(args: EthereumRequestArgs): Promise<unknown>;
  on(event: EthereumEventType, handler: (...args: unknown[]) => void): void;
  removeListener(event: EthereumEventType, handler: (...args: unknown[]) => void): void;
}

interface Window {
  ethereum?: EthereumProvider;
}

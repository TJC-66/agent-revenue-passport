import { studioDevnet } from 'genlayer-js/chains';

const DEFAULT_RPC_URL = 'https://studio-next.genlayer.com/api';
const DEFAULT_CHAIN_ID = 61997;
const DEFAULT_CHAIN_NAME = 'GenLayer Studio Next';
const DEFAULT_EXPLORER_URL = 'https://explorer-studio-dev.genlayer.com/';

function parseChainId(value: string | undefined) {
  if (!value?.trim()) return DEFAULT_CHAIN_ID;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`NEXT_PUBLIC_GENLAYER_CHAIN_ID must be a positive integer; received ${value}`);
  }
  return parsed;
}

const chainId = parseChainId(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID);
const chainName = process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME?.trim() || DEFAULT_CHAIN_NAME;
const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || DEFAULT_RPC_URL;
const symbol = process.env.NEXT_PUBLIC_GENLAYER_SYMBOL?.trim() || 'GEN';

export const GENLAYER_EXPLORER_URL = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL?.trim() || DEFAULT_EXPLORER_URL;

export const GENLAYER_CHAIN = {
  ...studioDevnet,
  id: chainId,
  name: chainName,
  nativeCurrency: { name: symbol, symbol, decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
} satisfies typeof studioDevnet;

export const GENLAYER_NETWORK = {
  chainId: `0x${chainId.toString(16).toUpperCase()}`,
  chainName,
  nativeCurrency: GENLAYER_CHAIN.nativeCurrency,
  rpcUrls: [rpcUrl],
  blockExplorerUrls: [GENLAYER_EXPLORER_URL],
};

export async function ensureStudioNextNetwork(provider: { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> }) {
  const current = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (typeof current === 'string' && Number.parseInt(current, 16) === chainId) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GENLAYER_NETWORK.chainId }],
    });
  } catch (caught) {
    const code = typeof caught === 'object' && caught !== null && 'code' in caught
      ? Number((caught as { code?: unknown }).code)
      : null;
    if (code !== 4902) throw caught;
    await provider.request({ method: 'wallet_addEthereumChain', params: [GENLAYER_NETWORK] });
  }
}

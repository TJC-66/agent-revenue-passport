import { BASE_RPC_URL } from "./antseed.js";
import { rpcCall } from "./http.js";

// Official Base mainnet deployment recorded in AntSeed's contracts repository.
export const ANTSEED_WASH_TRADING_REGISTRY = "0xc02a111CB94332Cc31C08E079cbe781880b2121C";

const SELECTORS = {
  isProvenWashTrader: "0x1f475040",
  provenWashVolume: "0x34247003",
  totalSellerVolume: "0xbcf0f540",
  provenWashShareBps: "0xf56dcb30",
  sellerEvidenceDigest: "0xc34b9b8e",
};

function assertAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid Base seller address");
}

function callData(selector, address) {
  return `${selector}${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function uintResult(value) {
  return BigInt(value || "0x0");
}

export async function readAntseedIntegrityStatus(seller, deps = {}) {
  assertAddress(seller);
  const rpc = deps.rpcCall ?? rpcCall;
  const rpcUrl = deps.rpcUrl ?? process.env.BASE_RPC_URL ?? BASE_RPC_URL;
  const registryAddress = deps.registryAddress ?? ANTSEED_WASH_TRADING_REGISTRY;
  const read = (selector) => rpc(rpcUrl, "eth_call", [{
    to: registryAddress,
    data: callData(selector, seller),
  }, "latest"]);

  const [flaggedRaw, washRaw, totalRaw, shareRaw, digest] = await Promise.all([
    read(SELECTORS.isProvenWashTrader),
    read(SELECTORS.provenWashVolume),
    read(SELECTORS.totalSellerVolume),
    read(SELECTORS.provenWashShareBps),
    read(SELECTORS.sellerEvidenceDigest),
  ]);
  const provenWashRaw = uintResult(washRaw);
  const totalSellerRaw = uintResult(totalRaw);
  const shareBps = Number(uintResult(shareRaw));
  const provenWashTrader = uintResult(flaggedRaw) !== 0n;

  return {
    source: "antseed-onchain-wash-registry",
    registryAddress,
    seller: seller.toLowerCase(),
    status: provenWashTrader ? "proven_wash_trader" : totalSellerRaw > 0n ? "proof_recorded_below_threshold" : "no_finalized_wash_proof",
    provenWashTrader,
    provenWashVolumeRaw: provenWashRaw.toString(),
    provenWashVolumeUsdc: Number(provenWashRaw) / 1_000_000,
    totalSellerVolumeRaw: totalSellerRaw.toString(),
    totalSellerVolumeUsdc: Number(totalSellerRaw) / 1_000_000,
    provenWashShareBps: shareBps,
    provenWashShare: shareBps / 10_000,
    evidenceDigest: /^0x0{64}$/i.test(digest) ? null : digest,
    note: provenWashTrader
      ? "AntSeed's proof registry contains a finalized wash-trading proof for this seller."
      : "No finalized AntSeed wash-trading proof currently crosses the registry threshold; this is not a guarantee that the seller is independent.",
  };
}

import { parseUnits, stringToHex } from "viem";

import type { SupportedTokenConfig } from "./tokens";

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const;

const BUNDLE_TYPES = {
  Bundle: [
    { name: "payer", type: "address" },
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "mainAmount", type: "uint256" },
    { name: "feeAmount", type: "uint256" },
    { name: "paymentId", type: "bytes32" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

export type AuthorizationMessage = {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
};

export type AuthorizationTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  primaryType: "TransferWithAuthorization";
  message: AuthorizationMessage;
};

export type BundleMessage = {
  payer: `0x${string}`;
  token: `0x${string}`;
  recipient: `0x${string}`;
  mainAmount: bigint;
  feeAmount: bigint;
  paymentId: `0x${string}`;
  deadline: bigint;
};

export type BundleTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof BUNDLE_TYPES;
  primaryType: "Bundle";
  message: BundleMessage;
};

export function buildAuthorizationTypedData(
  token: SupportedTokenConfig,
  chainId: number,
  message: AuthorizationMessage
): AuthorizationTypedData {
  return {
    domain: {
      name: token.domain.name,
      version: token.domain.version,
      chainId,
      verifyingContract: token.address
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message
  };
}

export function buildBundleTypedData(
  contractAddress: `0x${string}`,
  chainId: number,
  message: BundleMessage
): BundleTypedData {
  return {
    domain: {
      name: "ERC3009Executor",
      version: "1",
      chainId,
      verifyingContract: contractAddress
    },
    types: BUNDLE_TYPES,
    primaryType: "Bundle",
    message
  };
}

export function parseTokenAmount(input: string, decimals: number): bigint {
  return parseUnits(input || "0", decimals);
}

export function generateNonce(): `0x${string}` {
  const buffer = new Uint8Array(32);
  const cryptoApi =
    typeof globalThis !== "undefined" && globalThis.crypto
      ? globalThis.crypto
      : null;
  if (!cryptoApi) {
    throw new Error("ブラウザ環境のCrypto APIが利用できません。");
  }
  cryptoApi.getRandomValues(buffer);
  return `0x${Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export type SignatureParts = {
  signature: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
};

export function splitSignature(signature: `0x${string}`): SignatureParts {
  const stripped = signature.slice(2);
  const r = `0x${stripped.slice(0, 64)}` as const;
  const s = `0x${stripped.slice(64, 128)}` as const;
  let v = Number.parseInt(stripped.slice(128, 130), 16);
  if (v < 27) {
    v += 27;
  }
  return {
    signature,
    v,
    r,
    s
  };
}

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

export function normalizePaymentId(input?: string | null): `0x${string}` {
  if (!input || input.trim().length === 0) {
    return ZERO_BYTES32;
  }

  const trimmed = input.trim();
  if (trimmed.startsWith("0x") && trimmed.length === 66) {
    return trimmed as `0x${string}`;
  }

  const hex = stringToHex(trimmed);
  if (hex.length > 66) {
    throw new Error("paymentId は32バイト以内の文字列にしてください");
  }
  return hex.padEnd(66, "0") as `0x${string}`;
}

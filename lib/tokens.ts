import { parseUnits } from "viem";
import { arbitrum, mainnet, polygon } from "wagmi/chains";

export type SupportedTokenConfig = {
  symbol: "USDT" | "USDC" | "JPYC";
  name: string;
  address: `0x${string}`;
  decimals: number;
  domain: {
    name: string;
    version: string;
  };
};

export const SUPPORTED_CHAINS = [mainnet, polygon, arbitrum] as const;

export const DEFAULT_FEE_AMOUNT: Record<SupportedTokenConfig["symbol"], string> = {
  USDC: "0.005",
  USDT: "0.005",
  JPYC: "0.5"
};

export const SUPPORTED_TOKENS: Record<
  number,
  readonly SupportedTokenConfig[]
> = {
  [mainnet.id]: [
    {
      symbol: "USDC",
      name: "USD Coin",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      domain: {
        name: "USD Coin",
        version: "2"
      }
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      domain: {
        name: "Tether USD",
        version: "1"
      }
    },
    {
      symbol: "JPYC",
      name: "JPY Coin",
      address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
      decimals: 18,
      domain: {
        name: "JPY Coin",
        version: "1"
      }
    }
  ],
  [polygon.id]: [
    {
      symbol: "USDC",
      name: "USD Coin (PoS)",
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      decimals: 6,
      domain: {
        name: "USD Coin (PoS)",
        version: "1"
      }
    },
    {
      symbol: "USDT",
      name: "Tether USD (PoS)",
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      decimals: 6,
      domain: {
        name: "Tether USD (PoS)",
        version: "1"
      }
    },
    {
      symbol: "JPYC",
      name: "JPY Coin (PoS)",
      address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
      decimals: 18,
      domain: {
        name: "JPY Coin (PoS)",
        version: "1"
      }
    }
  ],
  [arbitrum.id]: [
    {
      symbol: "USDC",
      name: "USD Coin (Arb)",
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      domain: {
        name: "USD Coin (Arb)",
        version: "1"
      }
    },
    {
      symbol: "USDT",
      name: "Tether USD (Arb)",
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      domain: {
        name: "Tether USD (Arb)",
        version: "1"
      }
    }
  ]
};

export function getTokensForChain(chainId?: number) {
  if (!chainId) return [];
  return SUPPORTED_TOKENS[chainId] ?? [];
}

const TOKEN_AMOUNT_LIMITS: Record<
  SupportedTokenConfig["symbol"],
  {
    mainMin: string;
    mainMax: string;
    feeMin: string;
    feeMax: string;
  }
> = {
  USDC: {
    mainMin: "0.01",
    mainMax: "10000",
    feeMin: "0.0001",
    feeMax: "100"
  },
  USDT: {
    mainMin: "0.01",
    mainMax: "10000",
    feeMin: "0.0001",
    feeMax: "100"
  },
  JPYC: {
    mainMin: "100",
    mainMax: "5000000",
    feeMin: "1",
    feeMax: "50000"
  }
};

export function findTokenConfig(chainId: number, tokenAddress: string) {
  const tokens = getTokensForChain(chainId);
  const normalized = tokenAddress.toLowerCase();
  return tokens.find((item) => item.address.toLowerCase() === normalized);
}

export function getTokenAmountLimits(token: SupportedTokenConfig) {
  const limits = TOKEN_AMOUNT_LIMITS[token.symbol];
  const mainMin = parseUnits(limits.mainMin, token.decimals);
  const mainMax = parseUnits(limits.mainMax, token.decimals);
  const feeMin = parseUnits(limits.feeMin, token.decimals);
  const feeMax = parseUnits(limits.feeMax, token.decimals);
  return {
    main: {
      min: mainMin,
      max: mainMax,
      minDisplay: limits.mainMin,
      maxDisplay: limits.mainMax
    },
    fee: {
      min: feeMin,
      max: feeMax,
      minDisplay: limits.feeMin,
      maxDisplay: limits.feeMax
    }
  };
}

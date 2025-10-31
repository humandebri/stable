import type { Abi } from "viem";

export const erc3009ExecutorAbi = [
  {
    type: "function",
    name: "executeAuthorizedTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      {
        name: "auth",
        type: "tuple",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" }
        ]
      },
      { name: "mainAmount", type: "uint256" },
      { name: "feeAmount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "bundleSig", type: "bytes" }
    ],
    outputs: []
  }
] satisfies Abi;

export type ERC3009ExecutorAbi = typeof erc3009ExecutorAbi;

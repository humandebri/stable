const executorAddress =
  process.env.NEXT_PUBLIC_EXECUTOR_CONTRACT_ADDRESS ??
  process.env.NEXT_PUBLIC_FACILITATOR_CONTRACT_ADDRESS;

if (!process.env.NEXT_PUBLIC_EXECUTOR_CONTRACT_ADDRESS && process.env.NEXT_PUBLIC_FACILITATOR_CONTRACT_ADDRESS) {
  console.warn(
    "NEXT_PUBLIC_FACILITATOR_CONTRACT_ADDRESS is deprecated. Please rename it to NEXT_PUBLIC_EXECUTOR_CONTRACT_ADDRESS."
  );
}

if (!executorAddress) {
  throw new Error(
    "NEXT_PUBLIC_EXECUTOR_CONTRACT_ADDRESS is not set. Configure the deployed ERC3009 executor address in your environment."
  );
}

export const EXECUTOR_CONTRACT_ADDRESS = executorAddress;

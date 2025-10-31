export const FACILITATOR_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_FACILITATOR_CONTRACT_ADDRESS;

if (!FACILITATOR_CONTRACT_ADDRESS) {
  throw new Error(
    "NEXT_PUBLIC_FACILITATOR_CONTRACT_ADDRESS is not set. Set it in your environment to the facilitator executor contract address."
  );
}

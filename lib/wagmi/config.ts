import { http, createConfig } from "wagmi";
import { arbitrum, mainnet, polygon } from "wagmi/chains";
import {
  coinbaseWallet,
  injected,
  walletConnect
} from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required for WalletConnect."
  );
}

const metadata = {
  name: "Paylancer",
  description: "WalletConnect login for the Paylancer ERC-3009 facilitator dApp.",
  url: "https://example.com",
  icons: ["https://avatars.githubusercontent.com/u/37784886?s=200&v=4"]
};

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum],
  connectors: [
    injected({
      shimDisconnect: true
    }),
    coinbaseWallet({
      appName: "Paylancer"
    }),
    walletConnect({
      projectId,
      metadata,
      showQrModal: true
    })
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http()
  }
});

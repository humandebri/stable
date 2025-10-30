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
  name: "3009 Facilitated Payments",
  description: "WalletConnect login for ERC-3009 facilitated payments dApp.",
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
      appName: "3009 Facilitated Payments"
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

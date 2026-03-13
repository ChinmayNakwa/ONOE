import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

const anvil = defineChain({
  id: 1337,
  name: 'Anvil Local',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
})

export const config = createConfig({
  chains: [anvil],
  connectors: [injected()],
  transports: {
    [anvil.id]: http('http://127.0.0.1:8545', {
      batch: false, // disable batching to prevent phantom calls
    }),
  },
  // Disable all token/asset detection
  multiInjectedProviderDiscovery: false,
})
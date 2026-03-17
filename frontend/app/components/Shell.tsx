'use client';

import type { ReactNode } from 'react';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { CHAIN_ID } from '../lib/constants';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { colors, fonts } from '../lib/theme';
import { Banner, Button } from './ui';

// Page background, shared CSS and the responsive helper classes used by all pages.
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', color: colors.text, position: 'relative', backgroundColor: colors.bg,
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, #1e3a5f15 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #78350f10 0%, transparent 50%)',
    }}>
      {children}
      <GlobalStyles />
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: ${colors.bg}; font-family: ${fonts.mono}; }
      input::placeholder { color: ${colors.faint}; }
      input:focus, select:focus, button:focus-visible, a:focus-visible {
        outline: none; border-color: ${colors.amber} !important; box-shadow: 0 0 0 2px #f59e0b44;
      }
      button { transition: filter 0.15s, transform 0.1s; }
      button:hover:not(:disabled) { filter: brightness(1.15); }
      button:active:not(:disabled) { transform: scale(0.98); }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #0f172a; }
      ::-webkit-scrollbar-thumb { background: ${colors.borderStrong}; border-radius: 2px; }
      @keyframes onoe-spin { to { transform: rotate(360deg); } }

      .onoe-main { padding: 24px 32px; max-width: 1100px; margin: 0 auto; position: relative; z-index: 1; }
      .onoe-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .onoe-stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .onoe-header { display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; align-items: center; padding: 14px 32px; }
      @media (max-width: 640px) {
        .onoe-main { padding: 16px; }
        .onoe-header { padding: 12px 16px; }
      }
    `}</style>
  );
}

// Full-screen prompt shown before a wallet is connected.
export function ConnectPrompt({ icon, title, subtitle, button }: { icon: string; title: string; subtitle: string; button: string }) {
  const { connect } = useConnect();
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
        <h1 style={{ fontFamily: fonts.heading, fontSize: 38, letterSpacing: 4, color: colors.textStrong, marginBottom: 8, lineHeight: 1.1 }}>{title}</h1>
        <p style={{ color: colors.faint, fontSize: 13, letterSpacing: 1, marginBottom: 28 }}>{subtitle}</p>
        <Button onClick={() => connect({ connector: injected() })}>{button}</Button>
        <p style={{ color: colors.faint, fontSize: 11, marginTop: 16 }}>You need a browser wallet such as MetaMask.</p>
      </div>
    </main>
  );
}

// Shown at the top of a page when setup is wrong, so the voter is not left with an empty screen.
export function SetupBanners() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  return (
    <>
      {!CONTRACT_ADDRESS && (
        <Banner kind="error" style={{ marginBottom: 16 }}>
          NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Add it to frontend/.env.local and restart the dev server.
        </Banner>
      )}
      {isConnected && chainId !== CHAIN_ID && (
        <Banner kind="warning" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Your wallet is on the wrong network. Switch to the local Anvil chain (id {CHAIN_ID}).</span>
          <Button variant="secondary" loading={isPending} onClick={() => switchChain({ chainId: CHAIN_ID })} style={{ padding: '6px 12px', fontSize: 11 }}>
            SWITCH NETWORK
          </Button>
        </Banner>
      )}
    </>
  );
}

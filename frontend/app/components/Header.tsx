'use client';

import Link from 'next/link';
import { useAccount, useDisconnect } from 'wagmi';
import { colors, fonts } from '../lib/theme';
import { PhaseBadge, shortAddress } from './ui';

const LINKS = [
  { id: 'vote', href: '/', label: 'VOTE' },
  { id: 'results', href: '/results', label: 'RESULTS' },
  { id: 'admin', href: '/admin', label: 'ADMIN' },
] as const;

export type PageId = (typeof LINKS)[number]['id'];

export function Header({ title, subtitle, active, phase }: { title: string; subtitle: string; active: PageId; phase: number }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <header className="onoe-header" style={{
      borderBottom: `1px solid ${colors.border}`, backgroundColor: '#0d1424cc',
      backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontFamily: fonts.heading, fontSize: 20, letterSpacing: 3, color: colors.textStrong }}>🗳 {title}</div>
        <div style={{ fontSize: 10, color: colors.faint, fontFamily: fonts.mono, letterSpacing: 1 }}>{subtitle}</div>
      </div>

      <nav aria-label="Pages" style={{ display: 'flex', gap: 8 }}>
        {LINKS.map(link => (
          <Link key={link.id} href={link.href} aria-current={active === link.id ? 'page' : undefined} style={{
            padding: '6px 12px', borderRadius: 4, fontFamily: fonts.mono, fontSize: 11, fontWeight: 700,
            textDecoration: 'none', letterSpacing: 1,
            color: active === link.id ? colors.amber : colors.faint,
            border: `1px solid ${active === link.id ? colors.amber + '80' : colors.borderStrong}`,
            backgroundColor: active === link.id ? colors.amber + '15' : 'transparent',
          }}>
            {link.label}
          </Link>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <PhaseBadge phase={phase} />
        {isConnected && (
          <button onClick={() => disconnect()} title="Disconnect wallet" style={{
            padding: '5px 10px', borderRadius: 4, backgroundColor: colors.border, border: `1px solid ${colors.borderStrong}`,
            fontFamily: fonts.mono, fontSize: 11, color: colors.muted, cursor: 'pointer',
          }}>
            {shortAddress(address)} ✕
          </button>
        )}
      </div>
    </header>
  );
}

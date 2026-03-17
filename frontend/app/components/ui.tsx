'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { PHASE_COLORS, PHASE_LABELS, colors, fonts } from '../lib/theme';

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, ...style }}>
      {title && (
        <div style={{
          fontFamily: fonts.heading, fontSize: 16, letterSpacing: 2, color: colors.amber,
          marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 8,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

const bannerColors = {
  info: colors.blue,
  success: colors.green,
  warning: colors.amber,
  error: colors.red,
};

export function Banner({ kind = 'info', children, style }: { kind?: keyof typeof bannerColors; children: ReactNode; style?: CSSProperties }) {
  const color = bannerColors[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{
      padding: '10px 14px', borderRadius: 6, border: `1px solid ${color}`, backgroundColor: color + '15',
      color, fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.6, ...style,
    }}>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'onoe-spin 0.8s linear infinite',
    }} />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  full?: boolean;
};

export function Button({ variant = 'primary', loading, full, disabled, children, style, ...rest }: ButtonProps) {
  const off = disabled || loading;
  const look: CSSProperties =
    variant === 'primary' ? { backgroundColor: colors.amber, color: '#000', border: `1px solid ${colors.amber}` } :
    variant === 'danger' ? { backgroundColor: 'transparent', color: colors.red, border: `1px solid ${colors.red}` } :
    { backgroundColor: 'transparent', color: colors.muted, border: `1px solid ${colors.borderStrong}` };
  return (
    <button disabled={off} {...rest} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: '12px 20px', borderRadius: 6, fontFamily: fonts.mono, fontSize: 13, fontWeight: 700, letterSpacing: 1,
      width: full ? '100%' : undefined, opacity: off ? 0.5 : 1, cursor: off ? 'not-allowed' : 'pointer',
      ...look, ...style,
    }}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function PhaseBadge({ phase }: { phase: number }) {
  if (phase < 0) return null;
  const color = PHASE_COLORS[phase];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 4,
      border: `1px solid ${color}`, backgroundColor: color + '22',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ color, fontFamily: fonts.mono, fontSize: 11, fontWeight: 700 }}>{PHASE_LABELS[phase]}</span>
    </div>
  );
}

// A row of numbered steps. Steps before `current` are done, `current` is highlighted.
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol style={{ display: 'flex', gap: 8, listStyle: 'none', flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} style={{
            flex: '1 1 120px', textAlign: 'center', padding: '10px 8px', borderRadius: 6,
            fontFamily: fonts.mono, fontSize: 11, fontWeight: 700,
            backgroundColor: active ? colors.amber : done ? colors.green + '20' : colors.panel,
            color: active ? '#000' : done ? colors.green : colors.faint,
            border: `1px solid ${active ? colors.amber : done ? colors.green : colors.border}`,
          }}>
            {done ? '✓ ' : `${i + 1}. `}{label}
          </li>
        );
      })}
    </ol>
  );
}

export function Stat({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <Card style={{ textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: fonts.mono }}>{value}</div>
      <div style={{ color: colors.faint, fontSize: 10, fontFamily: fonts.mono, marginTop: 4, letterSpacing: 1 }}>{label}</div>
    </Card>
  );
}

export function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

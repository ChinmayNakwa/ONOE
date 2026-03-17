'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { Header } from '../components/Header';
import { ConnectPrompt, SetupBanners, Shell } from '../components/Shell';
import { Tally } from '../components/Tally';
import { Banner, Button, Card, Stat } from '../components/ui';
import { CHAIN_ID, CONSTITUENCIES, constituencyName } from '../lib/constants';
import { CONTRACT_ADDRESS, ONOE_ABI, friendlyError } from '../lib/contract';
import { PHASE_COLORS, PHASE_LABELS, colors, fonts } from '../lib/theme';
import { useElection } from '../lib/useElection';
import { useMounted } from '../lib/useMounted';

type Tab = 'phases' | 'candidates' | 'monitor';

// What the admin gives up by moving to each phase (index = the phase being started).
const CONSEQUENCES = [
  '',
  'Candidates can be registered from now on.',
  'Registration closes: no more candidates can be added. Voters can seal their votes.',
  'Voting closes: no new votes can be sealed. Voters can reveal their votes.',
  'Revealing closes and the results become final.',
];
const NEXT_BUTTON = ['', 'START REGISTRATION', 'START VOTING', 'START REVEALING', 'END ELECTION'];

export default function AdminPage() {
  // ── All hooks first, early returns after ──────────────────────────────────
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const election = useElection();

  const adminRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'ECI_ADMIN' });
  const { writeContract, data: txHash, isPending: walletOpen, error: txError, reset: resetTx } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const [tab, setTab] = useState<Tab>('phases');
  const [confirming, setConfirming] = useState(false);
  const [action, setAction] = useState<'phase' | 'candidate' | null>(null);

  const [name, setName] = useState('');
  const [party, setParty] = useState('');
  const [constituency, setConstituency] = useState(1);
  const [isMP, setIsMP] = useState(true);

  // After a transaction is mined, refresh the data.
  useEffect(() => {
    if (receipt.isSuccess) election.refetch();
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ────────────────────────────────────────────────────────
  const phase = election.phase;
  const nextPhase = phase >= 0 && phase < 4 ? phase + 1 : -1;
  const busy = walletOpen || (!!txHash && receipt.isLoading);
  const wrongNetwork = chainId !== CHAIN_ID;
  const adminAddress = adminRead.data as `0x${string}` | undefined;
  const isAdmin = !!address && !!adminAddress && address.toLowerCase() === adminAddress.toLowerCase();
  const canAddCandidate = phase === 1 && !!name.trim() && !!party.trim() && !busy && !wrongNetwork;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdvance = () => {
    if (nextPhase < 0) return;
    setAction('phase');
    setConfirming(false);
    resetTx();
    writeContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'setElectionState', args: [nextPhase] });
  };

  const handleAddCandidate = () => {
    if (!canAddCandidate) return;
    setAction('candidate');
    resetTx();
    writeContract({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'addCandidate',
      args: [name.trim(), party.trim(), BigInt(constituency), isMP],
    }, {
      onSuccess: () => { setName(''); setParty(''); },
    });
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────────────
  if (!mounted) return null;

  if (!isConnected) return (
    <Shell>
      <ConnectPrompt icon="🗳" title="ECI SECURE PORTAL" subtitle="Election Commission of India · Admin access" button="CONNECT ADMIN WALLET" />
    </Shell>
  );

  const header = <Header title="ECI ADMIN TERMINAL" subtitle="One Nation, One Election · Dashboard" active="admin" phase={phase} />;

  if (adminRead.isLoading) return <Shell>{header}<main className="onoe-main"><SetupBanners /><p style={{ color: colors.muted, fontSize: 13 }}>Checking admin wallet…</p></main></Shell>;

  if (!isAdmin) return (
    <Shell>
      {header}
      <main className="onoe-main" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 64 }}>
        <SetupBanners />
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontFamily: fonts.heading, fontSize: 34, letterSpacing: 4, color: colors.red, marginBottom: 8 }}>ACCESS DENIED</h1>
        <p style={{ color: colors.faint, fontSize: 13, marginBottom: 20 }}>Only the Election Commission administrator can use this page.</p>
        <p style={{ color: colors.faint, fontSize: 11, wordBreak: 'break-all' }}>CONNECTED: {address}</p>
        <p style={{ color: colors.faint, fontSize: 11, wordBreak: 'break-all' }}>REQUIRED: {adminAddress ?? 'unknown (cannot read the contract)'}</p>
      </main>
    </Shell>
  );

  const { candidates } = election;
  const constituencyIds = [...new Set(candidates.map(c => c.constituencyId))].sort((a, b) => a - b);

  return (
    <Shell>
      {header}

      <main className="onoe-main">
        <SetupBanners />

        <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 24, flexWrap: 'wrap' }}>
          {([['phases', '⚡ ELECTION PHASES'], ['candidates', '👤 CANDIDATES'], ['monitor', '📊 MONITOR']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{
              padding: '12px 20px', border: 'none', backgroundColor: 'transparent', fontFamily: fonts.mono, fontSize: 12, fontWeight: 700,
              letterSpacing: 1, cursor: 'pointer', color: tab === id ? colors.amber : colors.faint,
              borderBottom: `2px solid ${tab === id ? colors.amber : 'transparent'}`,
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── PHASES ── */}
        {tab === 'phases' && (
          <Card title="ELECTION PHASE CONTROL" style={{ maxWidth: 760 }}>
            <p style={{ color: colors.muted, fontSize: 13, marginBottom: 24 }}>
              Phases only move forward, one step at a time. Each step is final.
            </p>

            <ol style={{ display: 'flex', listStyle: 'none', marginBottom: 28, gap: 4 }}>
              {PHASE_LABELS.slice(1).map((label, i) => {
                const n = i + 1;
                const done = phase > n;
                const current = phase === n;
                const color = PHASE_COLORS[n];
                return (
                  <li key={label} aria-current={current ? 'step' : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                      backgroundColor: done ? color : current ? color + '33' : colors.border,
                      border: `2px solid ${done || current ? color : colors.borderStrong}`,
                      color: done ? '#000' : current ? color : colors.faint,
                      boxShadow: current ? `0 0 12px ${color}` : 'none',
                    }}>
                      {done ? '✓' : n}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 6, textAlign: 'center', color: current ? color : colors.faint }}>{label}</div>
                  </li>
                );
              })}
            </ol>

            {phase === 4 ? (
              <Banner kind="success">The election has ended. Results are final.</Banner>
            ) : nextPhase > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {!confirming ? (
                  <Button full disabled={wrongNetwork || busy} onClick={() => { resetTx(); setConfirming(true); }}>
                    {NEXT_BUTTON[nextPhase]} →
                  </Button>
                ) : (
                  <>
                    <Banner kind="warning">
                      Move the election to <b>{PHASE_LABELS[nextPhase]}</b>? {CONSEQUENCES[nextPhase]} This cannot be undone.
                    </Banner>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Button loading={busy} onClick={handleAdvance} style={{ flex: 1 }}>CONFIRM</Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)} style={{ flex: 1 }}>CANCEL</Button>
                    </div>
                  </>
                )}
                {action === 'phase' && busy && <Banner kind="info">{walletOpen ? 'Confirm the transaction in your wallet…' : 'Waiting for the chain to confirm…'}</Banner>}
                {action === 'phase' && txError && <Banner kind="error">✗ {friendlyError(txError)}</Banner>}
              </div>
            ) : null}
            {action === 'phase' && receipt.isSuccess && <Banner kind="success" style={{ marginTop: 12 }}>✓ Phase updated.</Banner>}
          </Card>
        )}

        {/* ── CANDIDATES ── */}
        {tab === 'candidates' && (
          <div className="onoe-grid">
            <Card title="REGISTER CANDIDATE">
              {phase !== 1 && (
                <Banner kind="warning" style={{ marginBottom: 16 }}>
                  Candidates can only be added during REGISTRATION. Current phase: {phase >= 0 ? PHASE_LABELS[phase] : '…'}.
                </Banner>
              )}
              <form onSubmit={e => { e.preventDefault(); handleAddCandidate(); }} style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label htmlFor="cand-name" style={labelStyle}>CANDIDATE NAME</label>
                  <input id="cand-name" style={inputStyle} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} disabled={phase !== 1} />
                </div>
                <div>
                  <label htmlFor="cand-party" style={labelStyle}>POLITICAL PARTY</label>
                  <input id="cand-party" style={inputStyle} placeholder="e.g. BJP, INC, SP" value={party} onChange={e => setParty(e.target.value)} disabled={phase !== 1} />
                </div>
                <div>
                  <label htmlFor="cand-const" style={labelStyle}>CONSTITUENCY</label>
                  <select id="cand-const" style={inputStyle} value={constituency} onChange={e => setConstituency(Number(e.target.value))} disabled={phase !== 1}>
                    {Object.keys(CONSTITUENCIES).map(id => <option key={id} value={id}>C{id} — {constituencyName(Number(id))}</option>)}
                  </select>
                </div>
                <div>
                  <span style={labelStyle}>SEAT TYPE</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ label: 'LOK SABHA (MP)', val: true }, { label: 'VIDHAN SABHA (MLA)', val: false }].map(({ label, val }) => (
                      <button type="button" key={label} onClick={() => setIsMP(val)} disabled={phase !== 1} aria-pressed={isMP === val} style={{
                        flex: 1, padding: '10px 8px', borderRadius: 6, fontFamily: fonts.mono, fontSize: 11, fontWeight: 700,
                        cursor: phase !== 1 ? 'not-allowed' : 'pointer', opacity: phase !== 1 ? 0.5 : 1,
                        border: `1px solid ${isMP === val ? colors.amber : colors.borderStrong}`,
                        backgroundColor: isMP === val ? colors.amber + '15' : 'transparent',
                        color: isMP === val ? colors.amber : colors.faint,
                      }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button type="submit" full loading={action === 'candidate' && busy} disabled={!canAddCandidate}>+ REGISTER CANDIDATE</Button>
                {action === 'candidate' && receipt.isSuccess && <Banner kind="success">✓ Candidate registered on-chain.</Banner>}
                {action === 'candidate' && txError && <Banner kind="error">✗ {friendlyError(txError)}</Banner>}
              </form>
            </Card>

            <Card title={`REGISTERED CANDIDATES (${candidates.length})`}>
              {candidates.length === 0 ? (
                <p style={{ color: colors.faint, fontSize: 13, textAlign: 'center', padding: '40px 0' }}>NO CANDIDATES REGISTERED</p>
              ) : (
                <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                  {candidates.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6 }}>
                      <div style={{
                        width: 40, height: 36, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: c.isMP ? colors.blue : colors.purple,
                        backgroundColor: (c.isMP ? colors.blue : colors.purple) + '15', border: `1px solid ${c.isMP ? colors.blue : colors.purple}`,
                      }}>
                        {c.isMP ? 'MP' : 'MLA'}
                      </div>
                      <div>
                        <div style={{ color: colors.textStrong, fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        <div style={{ color: colors.faint, fontSize: 11 }}>{c.party} · {constituencyName(c.constituencyId)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── MONITOR ── */}
        {tab === 'monitor' && (
          <div style={{ display: 'grid', gap: 20 }}>
            <div className="onoe-stats">
              <Stat label="CANDIDATES" value={candidates.length} color={colors.amber} />
              <Stat label="MP CANDIDATES" value={candidates.filter(c => c.isMP).length} color={colors.blue} />
              <Stat label="MLA CANDIDATES" value={candidates.filter(c => !c.isMP).length} color={colors.purple} />
              <Stat label="VOTERS REVEALED" value={election.totalRevealed} color={colors.green} />
            </div>
            {constituencyIds.length === 0 && <Card><p style={{ color: colors.faint, fontSize: 13, textAlign: 'center' }}>No candidates yet.</p></Card>}
            {constituencyIds.map(id => (
              <div key={id}>
                <h2 style={{ fontFamily: fonts.heading, fontSize: 18, letterSpacing: 2, color: colors.textStrong, marginBottom: 10 }}>
                  {constituencyName(id).toUpperCase()}
                </h2>
                <div className="onoe-grid">
                  <Tally title="LOK SABHA (MP)" accent={colors.blue} final={phase === 4} candidates={candidates.filter(c => c.constituencyId === id && c.isMP)} />
                  <Tally title="VIDHAN SABHA (MLA)" accent={colors.purple} final={phase === 4} candidates={candidates.filter(c => c.constituencyId === id && !c.isMP)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </Shell>
  );
}

const labelStyle = { display: 'block', fontSize: 10, color: colors.faint, letterSpacing: 1, marginBottom: 6, fontWeight: 700 } as const;
const inputStyle = {
  width: '100%', padding: '10px 12px', backgroundColor: colors.bg, border: `1px solid ${colors.borderStrong}`,
  borderRadius: 6, color: colors.text, fontFamily: fonts.mono, fontSize: 13,
} as const;

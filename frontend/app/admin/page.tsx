'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWriteContract, useAccount, useConnect, useReadContract, useReadContracts } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { ONOE_ABI } from '../abi';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const ADMIN_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const STATE_LABELS = ['NOT STARTED', 'REGISTRATION', 'VOTING', 'REVEALING', 'ENDED'];
const STATE_COLORS = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const STATE_DESCRIPTIONS = [
  'Election has not begun.',
  'Candidates can be registered.',
  'Voters may cast sealed votes.',
  'Voters may reveal their votes.',
  'Election concluded. Results are final.',
];

type Candidate = {
  id: number; name: string; party: string;
  constituencyId: number; isMP: boolean; voteCount: number;
};

export default function AdminPage() {
  // ── ALL hooks unconditionally at the top ──────────────────────────────────
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { writeContract, isPending, isError, error, isSuccess } = useWriteContract();

  const [name, setName] = useState('');
  const [party, setParty] = useState('');
  const [constituency, setConstituency] = useState(1);
  const [isMP, setIsMP] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'phases' | 'candidates' | 'monitor'>('phases');
  const [lastAction, setLastAction] = useState('');

  const { data: electionState, refetch: refetchState } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'state',
  });

  const { data: candidateCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'candidateCount',
  });

  // derive totalCandidates before useReadContracts
  const totalCandidates = candidateCount ? Math.min(Number(candidateCount), 50) : 0;

  const { data: candidatesData, refetch: refetchCandidates } = useReadContracts({
    contracts: Array.from({ length: totalCandidates }, (_, i) => ({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI,
      functionName: 'candidates' as const, args: [BigInt(i + 1)] as [bigint],
    })),
    query: { enabled: totalCandidates > 0 },
  });

  // Auto-refresh — totalCandidates NOT in dep array to avoid forward-ref error
  const refetchAll = useCallback(() => {
    refetchState();
    refetchCount();
    refetchCandidates();
  }, [refetchState, refetchCount, refetchCandidates]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(refetchAll, 3000);
    return () => clearInterval(interval);
  }, [refetchAll]);

  // ── Derived values ────────────────────────────────────────────────────────
  const candidates: Candidate[] = (candidatesData ?? [])
    .map(r => {
      if (r.status !== 'success' || !r.result) return null;
      const [id, name, party, constituencyId, isMP, voteCount] =
        r.result as [bigint, string, string, bigint, boolean, bigint];
      if (!name) return null;
      return { id: Number(id), name, party, constituencyId: Number(constituencyId), isMP, voteCount: Number(voteCount) };
    })
    .filter(Boolean) as Candidate[];

  const currentState = electionState !== undefined ? Number(electionState) : 0;
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStateChange = (stateIndex: number) => {
    setLastAction(STATE_LABELS[stateIndex]);
    writeContract(
      { address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'setElectionState', args: [stateIndex] },
      { onSuccess: () => setTimeout(refetchAll, 500) }
    );
  };

  const handleAddCandidate = () => {
    if (!name.trim() || !party.trim()) { alert('Fill all fields'); return; }
    setLastAction(`Adding ${name}`);
    writeContract(
      { address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'addCandidate', args: [name, party, BigInt(constituency), isMP] },
      {
        onSuccess: () => {
          setName(''); setParty('');
          // Wait for chain to index, then refetch
          setTimeout(async () => {
            await refetchCount();
            setTimeout(refetchCandidates, 300);
          }, 500);
        },
      }
    );
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────────────
  if (!mounted) return null;

  if (!isConnected) return (
    <div style={styles.page}>
      <div style={styles.grain} />
      <div style={styles.centerBox}>
        <div style={styles.emblem}>🗳</div>
        <h1 style={styles.title}>ECI SECURE PORTAL</h1>
        <p style={styles.subtitle}>Election Commission of India · Admin Access</p>
        <div style={styles.divider} />
        <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24, fontFamily: 'monospace' }}>
          AUTHENTICATION REQUIRED
        </p>
        <button style={styles.connectBtn} onClick={() => connect({ connector: injected() })}>
          CONNECT METAMASK
        </button>
      </div>
      <GlobalStyles />
    </div>
  );

  if (!isAdmin) return (
    <div style={styles.page}>
      <div style={styles.grain} />
      <div style={styles.centerBox}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ ...styles.title, color: '#ef4444' }}>ACCESS DENIED</h1>
        <p style={styles.subtitle}>Restricted to Election Commission Administrator.</p>
        <div style={styles.divider} />
        <p style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace', marginTop: 16 }}>CONNECTED: {address}</p>
        <p style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace' }}>REQUIRED: {ADMIN_ADDRESS}</p>
      </div>
      <GlobalStyles />
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  const mpCandidates = candidates.filter(c => c.isMP);
  const mlaCandidates = candidates.filter(c => !c.isMP);
  const maxVotes = Math.max(1, ...candidates.map(c => c.voteCount));

  return (
    <div style={styles.page}>
      <div style={styles.grain} />

      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🗳</span>
          <div>
            <div style={styles.headerTitle}>ECI ADMIN TERMINAL</div>
            <div style={styles.headerSub}>One Nation, One Election · Secure Dashboard</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ ...styles.stateBadge, backgroundColor: STATE_COLORS[currentState] + '22', borderColor: STATE_COLORS[currentState] }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATE_COLORS[currentState], display: 'inline-block', marginRight: 8, boxShadow: `0 0 6px ${STATE_COLORS[currentState]}` }} />
            <span style={{ color: STATE_COLORS[currentState], fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
              {STATE_LABELS[currentState]}
            </span>
          </div>
          <div style={styles.walletBadge}>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
        </div>
      </header>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={styles.statusItem}>CONTRACT: <span style={{ color: '#f59e0b' }}>{CONTRACT_ADDRESS?.slice(0, 10)}...{CONTRACT_ADDRESS?.slice(-6)}</span></span>
        <span style={styles.statusItem}>CANDIDATES: <span style={{ color: '#10b981' }}>{totalCandidates}</span></span>
        <span style={styles.statusItem}>PHASE: <span style={{ color: STATE_COLORS[currentState] }}>{currentState}/4</span></span>
        {lastAction && <span style={styles.statusItem}>LAST: <span style={{ color: isSuccess ? '#10b981' : '#f59e0b' }}>{lastAction}</span></span>}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['phases', 'candidates', 'monitor'] as const).map(tab => (
          <button key={tab} style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }} onClick={() => setActiveTab(tab)}>
            {tab === 'phases' ? '⚡ ELECTION PHASES' : tab === 'candidates' ? '👤 CANDIDATES' : '📊 MONITOR'}
          </button>
        ))}
      </div>

      <main style={styles.main}>

        {/* ── PHASES TAB ── */}
        {activeTab === 'phases' && (
          <div style={styles.card}>
            <div style={styles.cardTitle}>ELECTION PHASE CONTROL</div>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24, fontFamily: 'monospace' }}>
              {STATE_DESCRIPTIONS[currentState]}
            </p>

            {/* Phase pipeline */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
              {STATE_LABELS.slice(1).map((label, i) => {
                const stateNum = i + 1;
                const isDone = currentState > stateNum;
                const isCurrent = currentState === stateNum;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        backgroundColor: isDone ? STATE_COLORS[stateNum] : isCurrent ? STATE_COLORS[stateNum] + '33' : '#1f2937',
                        border: `2px solid ${isCurrent || isDone ? STATE_COLORS[stateNum] : '#374151'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, color: isCurrent || isDone ? STATE_COLORS[stateNum] : '#6b7280',
                        boxShadow: isCurrent ? `0 0 12px ${STATE_COLORS[stateNum]}` : 'none',
                      }}>
                        {isDone ? '✓' : stateNum}
                      </div>
                      <div style={{ fontSize: 10, color: isCurrent ? STATE_COLORS[stateNum] : '#4b5563', marginTop: 6, fontFamily: 'monospace', textAlign: 'center' }}>
                        {label}
                      </div>
                    </div>
                    {i < 3 && <div style={{ height: 2, flex: 0.3, backgroundColor: isDone ? STATE_COLORS[stateNum] : '#1f2937', marginBottom: 20 }} />}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'START REGISTRATION', state: 1, color: '#3b82f6', icon: '📋' },
                { label: 'START VOTING', state: 2, color: '#10b981', icon: '🗳' },
                { label: 'START REVEALING', state: 3, color: '#f59e0b', icon: '🔓' },
                { label: 'END ELECTION', state: 4, color: '#ef4444', icon: '🏁' },
              ].map(({ label, state, color, icon }) => (
                <button key={state} onClick={() => handleStateChange(state)}
                  disabled={isPending || currentState === state}
                  style={{
                    ...styles.phaseBtn, borderColor: color,
                    color: currentState === state ? color : '#9ca3af',
                    backgroundColor: currentState === state ? color + '15' : 'transparent',
                    opacity: isPending ? 0.5 : 1,
                    cursor: isPending || currentState === state ? 'not-allowed' : 'pointer',
                  }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{label}</span>
                  {currentState === state && <span style={{ fontSize: 10, color, fontFamily: 'monospace' }}>● ACTIVE</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CANDIDATES TAB ── */}
        {activeTab === 'candidates' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>REGISTER CANDIDATE</div>
              {currentState !== 1 && (
                <div style={{ ...styles.warningMsg, marginBottom: 16 }}>
                  ⚠ Candidates can only be added during REGISTRATION phase. Current: {STATE_LABELS[currentState]}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={styles.label}>CANDIDATE NAME</label>
                  <input style={styles.input} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>POLITICAL PARTY</label>
                  <input style={styles.input} placeholder="e.g. BJP, INC, SP" value={party} onChange={e => setParty(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>CONSTITUENCY</label>
                  <select style={styles.input} value={constituency} onChange={e => setConstituency(Number(e.target.value))}>
                    <option value={1}>C1 — Varanasi</option>
                    <option value={2}>C2 — Wayanad</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>SEAT TYPE</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ label: 'LOK SABHA (MP)', val: true }, { label: 'VIDHAN SABHA (MLA)', val: false }].map(({ label, val }) => (
                      <button key={label} onClick={() => setIsMP(val)} style={{
                        flex: 1, padding: '10px 8px', borderRadius: 6, border: '1px solid',
                        borderColor: isMP === val ? '#f59e0b' : '#374151',
                        backgroundColor: isMP === val ? '#f59e0b15' : 'transparent',
                        color: isMP === val ? '#f59e0b' : '#6b7280',
                        fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                      }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleAddCandidate} disabled={isPending || !name.trim() || !party.trim()}
                  style={{
                    ...styles.submitBtn,
                    opacity: isPending || !name.trim() || !party.trim() ? 0.5 : 1,
                    cursor: isPending || !name.trim() || !party.trim() ? 'not-allowed' : 'pointer',
                  }}>
                  {isPending ? '⏳ CONFIRMING IN METAMASK...' : '+ REGISTER CANDIDATE'}
                </button>
                {isSuccess && <div style={styles.successMsg}>✓ Candidate registered on-chain</div>}
                {isError && <div style={styles.errorMsg}>✗ {error?.message.split('\n')[0]}</div>}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>REGISTERED CANDIDATES ({totalCandidates})</div>
              {candidates.length === 0 ? (
                <div style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                  NO CANDIDATES REGISTERED
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                  {candidates.map(c => (
                    <div key={c.id} style={styles.candidateRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                          backgroundColor: c.isMP ? '#3b82f615' : '#8b5cf615',
                          border: `1px solid ${c.isMP ? '#3b82f6' : '#8b5cf6'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: c.isMP ? '#3b82f6' : '#8b5cf6', fontFamily: 'monospace', fontWeight: 700,
                        }}>
                          {c.isMP ? 'MP' : 'MLA'}
                        </div>
                        <div>
                          <div style={{ color: '#f9fafb', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                          <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{c.party} · C{c.constituencyId}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 700, fontSize: 18 }}>{c.voteCount}</div>
                        <div style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}>VOTES</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MONITOR TAB ── */}
        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { label: 'TOTAL CANDIDATES', value: totalCandidates, color: '#f59e0b', icon: '👤' },
                { label: 'MP SEATS', value: mpCandidates.length, color: '#3b82f6', icon: '🏛' },
                { label: 'MLA SEATS', value: mlaCandidates.length, color: '#8b5cf6', icon: '🏢' },
                { label: 'VOTES REVEALED', value: Math.floor(candidates.reduce((s, c) => s + c.voteCount, 0) / 2), color: '#10b981', icon: '✓' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
                  <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[{ title: 'LOK SABHA (MP)', list: mpCandidates, color: '#3b82f6' }, { title: 'VIDHAN SABHA (MLA)', list: mlaCandidates, color: '#8b5cf6' }].map(({ title, list, color }) => (
                <div key={title} style={styles.card}>
                  <div style={styles.cardTitle}>{title}</div>
                  {list.length === 0 ? (
                    <div style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>NO CANDIDATES</div>
                  ) : (
                    [...list].sort((a, b) => b.voteCount - a.voteCount).map((c, i) => (
                      <div key={c.id} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#e5e7eb', fontSize: 13 }}>
                            {i === 0 && c.voteCount > 0 ? '👑 ' : `${i + 1}. `}{c.name} <span style={{ color: '#6b7280' }}>({c.party})</span>
                          </span>
                          <span style={{ color, fontFamily: 'monospace', fontWeight: 700 }}>{c.voteCount}</span>
                        </div>
                        <div style={{ height: 4, backgroundColor: '#1f2937', borderRadius: 2 }}>
                          <div style={{ height: 4, width: `${(c.voteCount / maxVotes) * 100}%`, backgroundColor: color, borderRadius: 2, transition: 'width 0.5s', minWidth: c.voteCount > 0 ? 4 : 0 }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <GlobalStyles />
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0a0f1a; }
      input::placeholder { color: #4b5563; }
      input:focus, select:focus { outline: none; border-color: #f59e0b !important; box-shadow: 0 0 0 2px #f59e0b22; }
      button { transition: filter 0.15s, transform 0.1s; }
      button:hover:not(:disabled) { filter: brightness(1.15); }
      button:active:not(:disabled) { transform: scale(0.98); }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #0f172a; }
      ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
    `}</style>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', backgroundColor: '#0a0f1a',
    backgroundImage: 'radial-gradient(ellipse at 20% 50%, #1e3a5f15 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #78350f10 0%, transparent 50%)',
    color: '#e5e7eb', position: 'relative', overflow: 'hidden',
  },
  grain: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.4,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 32px', borderBottom: '1px solid #1f2937',
    backgroundColor: '#0d1424cc', backdropFilter: 'blur(8px)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  headerTitle: { fontFamily: '"Bebas Neue", monospace', fontSize: 22, letterSpacing: 3, color: '#f9fafb' },
  headerSub: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', letterSpacing: 1 },
  stateBadge: { padding: '6px 14px', borderRadius: 4, border: '1px solid', display: 'flex', alignItems: 'center' },
  walletBadge: { padding: '6px 12px', borderRadius: 4, backgroundColor: '#1f2937', border: '1px solid #374151', fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' },
  statusBar: { display: 'flex', gap: 32, padding: '8px 32px', backgroundColor: '#0d1424', borderBottom: '1px solid #1f2937' },
  statusItem: { color: '#6b7280', fontSize: 12, fontFamily: 'monospace' } as React.CSSProperties,
  tabs: { display: 'flex', padding: '0 32px', borderBottom: '1px solid #1f2937', backgroundColor: '#0d1424' },
  tab: { padding: '12px 24px', border: 'none', backgroundColor: 'transparent', color: '#6b7280', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderBottom: '2px solid transparent', letterSpacing: 1 },
  tabActive: { color: '#f59e0b', borderBottom: '2px solid #f59e0b' } as React.CSSProperties,
  main: { padding: '24px 32px', position: 'relative', zIndex: 1 },
  card: { backgroundColor: '#0d1424', border: '1px solid #1f2937', borderRadius: 8, padding: 20 },
  cardTitle: { fontFamily: '"Bebas Neue", monospace', fontSize: 16, letterSpacing: 2, color: '#f59e0b', marginBottom: 16, borderBottom: '1px solid #1f2937', paddingBottom: 8 },
  phaseBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 12px', borderRadius: 6, border: '1px solid' } as React.CSSProperties,
  label: { display: 'block', fontSize: 10, fontFamily: 'monospace', color: '#6b7280', letterSpacing: 1, marginBottom: 6, fontWeight: 700 } as React.CSSProperties,
  input: { width: '100%', padding: '10px 12px', backgroundColor: '#0a0f1a', border: '1px solid #374151', borderRadius: 6, color: '#e5e7eb', fontFamily: 'monospace', fontSize: 13 },
  submitBtn: { width: '100%', padding: '12px', backgroundColor: '#f59e0b', border: 'none', borderRadius: 6, color: '#000', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: 1 },
  successMsg: { padding: '10px 12px', backgroundColor: '#10b98115', border: '1px solid #10b981', borderRadius: 6, color: '#10b981', fontFamily: 'monospace', fontSize: 12 },
  errorMsg: { padding: '10px 12px', backgroundColor: '#ef444415', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', fontFamily: 'monospace', fontSize: 12 },
  warningMsg: { padding: '10px 12px', backgroundColor: '#f59e0b15', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', fontFamily: 'monospace', fontSize: 12 },
  candidateRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#0a0f1a', border: '1px solid #1f2937', borderRadius: 6 },
  centerBox: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: 420 },
  emblem: { fontSize: 56, marginBottom: 16 },
  title: { fontFamily: '"Bebas Neue", monospace', fontSize: 36, letterSpacing: 4, color: '#f9fafb', marginBottom: 8 },
  subtitle: { color: '#6b7280', fontSize: 13, fontFamily: 'monospace', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#1f2937', margin: '24px 0' },
  connectBtn: { padding: '12px 32px', backgroundColor: '#f59e0b', border: 'none', borderRadius: 6, color: '#000', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 2 },
};
// web/app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAccount, useConnect, useWriteContract, useReadContract, useReadContracts } from 'wagmi';
import { keccak256, encodePacked, toHex } from 'viem';
import { ONOE_ABI } from './abi';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

type VotePhase = 'auth' | 'vote' | 'committed' | 'revealed';
type Candidate = { id: number; name: string; party: string; constituencyId: number; isMP: boolean; };

const STATE_LABELS = ['NOT STARTED', 'REGISTRATION', 'VOTING', 'REVEALING', 'ENDED'];
const STATE_COLORS = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

// LocalStorage helpers
const LS = {
  save: (phase: VotePhase, mpId: number, mlaId: number, constId: number, salt: string) => {
    localStorage.setItem('v_phase', phase);
    localStorage.setItem('v_mp', String(mpId));
    localStorage.setItem('v_mla', String(mlaId));
    localStorage.setItem('v_const', String(constId));
    localStorage.setItem('v_salt', salt);
  },
  load: () => ({
    phase: (localStorage.getItem('v_phase') || 'auth') as VotePhase,
    mpId: Number(localStorage.getItem('v_mp') || 0),
    mlaId: Number(localStorage.getItem('v_mla') || 0),
    constId: Number(localStorage.getItem('v_const') || 0),
    salt: localStorage.getItem('v_salt') || '',
  }),
  clear: () => ['v_phase','v_mp','v_mla','v_const','v_salt'].forEach(k => localStorage.removeItem(k)),
};

export default function VoterPage() {
  // ── ALL hooks unconditionally ─────────────────────────────────────────────
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { writeContract, isPending } = useWriteContract();

  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<VotePhase>('auth');
  const [voterId, setVoterId] = useState('');
  const [authData, setAuthData] = useState<{ constituencyId: number; signature: string; nullifier: string; deadline: number } | null>(null);
  const [selectedMP, setSelectedMP] = useState(0);
  const [selectedMLA, setSelectedMLA] = useState(0);
  const [salt, setSalt] = useState('');
  const [authError, setAuthError] = useState('');

  const { data: electionState } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'state',
  });

  const { data: candidateCount } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'candidateCount',
  });

  const totalCandidates = candidateCount ? Math.min(Number(candidateCount), 50) : 0;

  const { data: candidatesData } = useReadContracts({
    contracts: Array.from({ length: totalCandidates }, (_, i) => ({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI,
      functionName: 'candidates' as const, args: [BigInt(i + 1)] as [bigint],
    })),
    query: { enabled: totalCandidates > 0 },
  });

  // Check if this wallet already voted on-chain
  const { data: hasVotedOnChain } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI,
    functionName: 'hasVoted', args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  // Restore state from localStorage on mount
  useEffect(() => {
    const saved = LS.load();
    setPhase(saved.phase);
    setSelectedMP(saved.mpId);
    setSelectedMLA(saved.mlaId);
    setSalt(saved.salt);
    if (saved.phase !== 'auth' && saved.constId) {
      setAuthData({ constituencyId: saved.constId, signature: '', nullifier: '', deadline: 0 });
    }
    setMounted(true);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentState = electionState !== undefined ? Number(electionState) : -1;

  const allCandidates: Candidate[] = (candidatesData ?? [])
    .map(r => {
      if (r.status !== 'success' || !r.result) return null;
      const [id, name, party, constituencyId, isMP] = r.result as [bigint, string, string, bigint, boolean, bigint];
      if (!name) return null;
      return { id: Number(id), name, party, constituencyId: Number(constituencyId), isMP };
    }).filter(Boolean) as Candidate[];

  const constId = authData?.constituencyId ?? 0;
  const mpCandidates = allCandidates.filter(c => c.isMP && (!constId || c.constituencyId === constId));
  const mlaCandidates = allCandidates.filter(c => !c.isMP && (!constId || c.constituencyId === constId));

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthError('');
    try {
      const res = await fetch('/api/auth-voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId, walletAddress: address }),
      });
      const data = await res.json();
      if (data.verified) {
        const randomSalt = keccak256(toHex(Math.random().toString(36))); // bytes32 salt
        setAuthData(data);
        setSalt(randomSalt);
        setPhase('vote');
        LS.save('vote', 0, 0, data.constituencyId, randomSalt);
      } else {
        setAuthError(data.error || 'Verification failed');
      }
    } catch {
      setAuthError('Network error. Try again.');
    }
  };

  const handleCommit = () => {
    if (!selectedMP || !selectedMLA || !authData || phase !== 'vote') return;
    const commitment = keccak256(encodePacked(
      ['uint256', 'uint256', 'uint256', 'address', 'bytes32'],
      [BigInt(selectedMP), BigInt(selectedMLA), BigInt(authData.constituencyId), address as `0x${string}`, salt as `0x${string}`]
    ));
    writeContract({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'commitVote',
      args: [commitment, BigInt(authData.constituencyId), authData.nullifier as `0x${string}`, BigInt(authData.deadline), authData.signature as `0x${string}`],
    }, {
      onSuccess: () => {
        setPhase('committed');
        LS.save('committed', selectedMP, selectedMLA, authData.constituencyId, salt);
      },
      onError: err => alert(`Commit failed: ${err.message.split('\n')[0]}`),
    });
  };

  const handleReveal = () => {
    const saved = LS.load();
    const mpId = saved.mpId || selectedMP;
    const mlaId = saved.mlaId || selectedMLA;
    const cId = saved.constId || authData?.constituencyId || 0;
    const s = saved.salt || salt;
    if (!mpId || !mlaId || !cId || !s) return alert('Vote data missing. Cannot reveal.');
    writeContract({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'revealVote',
      args: [BigInt(mpId), BigInt(mlaId), BigInt(cId), s as `0x${string}`],
    }, {
      onSuccess: () => {
        setPhase('revealed');
        LS.clear();
        localStorage.setItem('v_phase', 'revealed');
      },
      onError: err => alert(`Reveal failed: ${err.message.split('\n')[0]}`),
    });
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────────────
  if (!mounted) return null;

  if (!isConnected) return (
    <div style={styles.page}>
      <div style={styles.grain} />
      <div style={styles.centerBox}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🗳</div>
        <h1 style={styles.title}>ONE NATION<br/>ONE ELECTION</h1>
        <p style={styles.subtitle}>Secure Blockchain Voting Portal</p>
        <div style={styles.divider} />
        <button style={styles.connectBtn} onClick={() => connect({ connector: connectors[0] })}>
          CONNECT WALLET TO VOTE
        </button>
      </div>
      <GlobalStyles />
    </div>
  );

  // Warn if wrong election state for voting
  const stateWarning = currentState === 0 ? 'Election has not started yet.' :
    currentState === 1 ? 'Election is in Registration phase. Voting not yet open.' :
    currentState === 4 ? 'Election has ended.' : null;

  const stepPhases: VotePhase[] = ['auth', 'vote', 'committed', 'revealed'];
  const stepLabels = ['Verify Identity', 'Cast Vote', 'Vote Sealed', 'Vote Revealed'];

  return (
    <div style={styles.page}>
      <div style={styles.grain} />

      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🗳</span>
          <div>
            <div style={styles.headerTitle}>ONE NATION, ONE ELECTION</div>
            <div style={styles.headerSub}>Secure Blockchain Voting Portal</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentState >= 0 && (
            <div style={{ ...styles.stateBadge, backgroundColor: STATE_COLORS[currentState] + '22', borderColor: STATE_COLORS[currentState] }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: STATE_COLORS[currentState], display: 'inline-block', marginRight: 7, boxShadow: `0 0 5px ${STATE_COLORS[currentState]}` }} />
              <span style={{ color: STATE_COLORS[currentState], fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                {STATE_LABELS[currentState]}
              </span>
            </div>
          )}
          <div style={styles.walletBadge}>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
          <a href="/results" style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: 11, textDecoration: 'none', padding: '6px 12px', border: '1px solid #f59e0b40', borderRadius: 4 }}>
            VIEW RESULTS →
          </a>
        </div>
      </header>

      <main style={{ padding: '32px', maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* State warning */}
        {stateWarning && phase === 'auth' && (
          <div style={{ ...styles.warningMsg, marginBottom: 24 }}>⚠ {stateWarning}</div>
        )}

        {/* On-chain already voted warning */}
        {hasVotedOnChain && phase === 'auth' && (
          <div style={{ ...styles.warningMsg, marginBottom: 24, borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#ef444415' }}>
            ⚠ This wallet has already committed a vote on-chain. Proceed to reveal if the election is in Revealing phase.
          </div>
        )}

        {/* Step progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {stepLabels.map((label, i) => {
            const isActive = phase === stepPhases[i];
            const isDone = stepPhases.indexOf(phase) > i;
            return (
              <div key={i} style={{
                flex: 1, textAlign: 'center', padding: '10px 8px', borderRadius: 6,
                fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                backgroundColor: isActive ? '#f59e0b' : isDone ? '#10b98120' : '#0d1424',
                color: isActive ? '#000' : isDone ? '#10b981' : '#4b5563',
                border: `1px solid ${isActive ? '#f59e0b' : isDone ? '#10b981' : '#1f2937'}`,
              }}>
                {isDone ? '✓ ' : `${i + 1}. `}{label}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: AUTH ── */}
        {phase === 'auth' && (
          <div style={styles.card}>
            <div style={styles.cardTitle}>VOTER VERIFICATION</div>
            <p style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 12, marginBottom: 20 }}>
              Enter your Voter ID to verify identity with the Government Node.
            </p>
            <label style={styles.label}>VOTER ID</label>
            <input
              style={{ ...styles.input, marginBottom: 16 }}
              placeholder="e.g. VARANASI01"
              value={voterId}
              onChange={e => setVoterId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            {authError && <div style={{ ...styles.errorMsg, marginBottom: 12 }}>✗ {authError}</div>}
            <button onClick={handleLogin} disabled={!voterId.trim()}
              style={{ ...styles.submitBtn, opacity: !voterId.trim() ? 0.5 : 1, cursor: !voterId.trim() ? 'not-allowed' : 'pointer' }}>
              VERIFY WITH GOVERNMENT NODE
            </button>
          </div>
        )}

        {/* ── STEP 2: VOTE ── */}
        {(phase === 'vote' || phase === 'committed' || phase === 'revealed') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Verified banner */}
            <div style={{ ...styles.successMsg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✓ VERIFIED · Constituency {authData?.constituencyId}</span>
              {phase === 'vote' && <span style={{ fontSize: 11 }}>Salt saved automatically</span>}
            </div>

            {/* Phase-specific info */}
            {phase === 'committed' && (
              <div style={styles.warningMsg}>
                🔒 Vote sealed on-chain. Wait for admin to start REVEALING phase, then click REVEAL VOTE.
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  Sealed: MP ID {selectedMP || LS.load().mpId} · MLA ID {selectedMLA || LS.load().mlaId}
                </div>
              </div>
            )}

            {/* Candidate selection grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, opacity: phase !== 'vote' ? 0.4 : 1, pointerEvents: phase !== 'vote' ? 'none' : 'auto' }}>
              {/* MP */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>LOK SABHA (MP)</div>
                {mpCandidates.length === 0 ? (
                  <p style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12 }}>No MP candidates in your constituency.</p>
                ) : mpCandidates.map(c => (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px',
                    marginBottom: 8, borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${selectedMP === c.id ? '#3b82f6' : '#1f2937'}`,
                    backgroundColor: selectedMP === c.id ? '#3b82f615' : '#0a0f1a',
                  }}>
                    <input type="radio" name="mp" checked={selectedMP === c.id} onChange={() => setSelectedMP(c.id)} style={{ accentColor: '#3b82f6' }} />
                    <div>
                      <div style={{ color: '#f9fafb', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{c.party}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* MLA */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>VIDHAN SABHA (MLA)</div>
                {mlaCandidates.length === 0 ? (
                  <p style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12 }}>No MLA candidates in your constituency.</p>
                ) : mlaCandidates.map(c => (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px',
                    marginBottom: 8, borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${selectedMLA === c.id ? '#8b5cf6' : '#1f2937'}`,
                    backgroundColor: selectedMLA === c.id ? '#8b5cf615' : '#0a0f1a',
                  }}>
                    <input type="radio" name="mla" checked={selectedMLA === c.id} onChange={() => setSelectedMLA(c.id)} style={{ accentColor: '#8b5cf6' }} />
                    <div>
                      <div style={{ color: '#f9fafb', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{c.party}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleCommit}
                disabled={phase !== 'vote' || isPending || !selectedMP || !selectedMLA}
                style={{
                  flex: 1, padding: '16px', borderRadius: 8, border: '1px solid',
                  fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: 1,
                  cursor: phase !== 'vote' || !selectedMP || !selectedMLA || isPending ? 'not-allowed' : 'pointer',
                  backgroundColor: phase === 'committed' || phase === 'revealed' ? '#10b98115' : phase !== 'vote' || !selectedMP || !selectedMLA ? '#1f2937' : isPending ? '#1f2937' : '#3b82f6',
                  borderColor: phase === 'committed' || phase === 'revealed' ? '#10b981' : '#3b82f6',
                  color: phase === 'committed' || phase === 'revealed' ? '#10b981' : '#fff',
                  opacity: phase !== 'vote' || !selectedMP || !selectedMLA ? 0.5 : 1,
                }}>
                {phase === 'committed' || phase === 'revealed' ? '✓ VOTE SEALED' : isPending ? '⏳ CONFIRM IN METAMASK...' : '🔒 CAST SEALED VOTE'}
              </button>

              <button onClick={handleReveal}
                disabled={phase !== 'committed' || isPending}
                style={{
                  flex: 1, padding: '16px', borderRadius: 8, border: '1px solid',
                  fontFamily: 'monospace', fontSize: 14, fontWeight: 700, letterSpacing: 1,
                  cursor: phase !== 'committed' || isPending ? 'not-allowed' : 'pointer',
                  backgroundColor: phase === 'revealed' ? '#10b98115' : phase !== 'committed' ? '#1f2937' : isPending ? '#1f2937' : '#f59e0b',
                  borderColor: phase === 'revealed' ? '#10b981' : '#f59e0b',
                  color: phase === 'revealed' ? '#10b981' : phase !== 'committed' ? '#4b5563' : '#000',
                  opacity: phase !== 'committed' ? 0.5 : 1,
                }}>
                {phase === 'revealed' ? '✓ VOTE REVEALED' : isPending ? '⏳ CONFIRM IN METAMASK...' : '🔓 REVEAL VOTE'}
              </button>
            </div>

            {/* Success state */}
            {phase === 'revealed' && (
              <div style={{ ...styles.card, textAlign: 'center', borderColor: '#10b981' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🗳</div>
                <div style={{ fontFamily: '"Bebas Neue", monospace', fontSize: 28, letterSpacing: 2, color: '#10b981', marginBottom: 8 }}>
                  VOTE COUNTED
                </div>
                <p style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 12, marginBottom: 20 }}>
                  Thank you for participating in One Nation, One Election.
                </p>
                <a href="/results" style={{ display: 'inline-block', padding: '10px 24px', backgroundColor: '#f59e0b', color: '#000', borderRadius: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: 12, textDecoration: 'none', letterSpacing: 1 }}>
                  VIEW LIVE RESULTS →
                </a>
              </div>
            )}
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
      input:focus { outline: none; border-color: #f59e0b !important; box-shadow: 0 0 0 2px #f59e0b22; }
      button { transition: filter 0.15s, transform 0.1s; }
      button:hover:not(:disabled) { filter: brightness(1.1); }
      button:active:not(:disabled) { transform: scale(0.98); }
    `}</style>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#0a0f1a', backgroundImage: 'radial-gradient(ellipse at 20% 50%, #1e3a5f15 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #78350f10 0%, transparent 50%)', color: '#e5e7eb', position: 'relative' },
  grain: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.4, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")` },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 32px', borderBottom: '1px solid #1f2937', backgroundColor: '#0d1424cc', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 },
  headerTitle: { fontFamily: '"Bebas Neue", monospace', fontSize: 18, letterSpacing: 3, color: '#f9fafb' },
  headerSub: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace', letterSpacing: 1 },
  stateBadge: { padding: '5px 12px', borderRadius: 4, border: '1px solid', display: 'flex', alignItems: 'center' },
  walletBadge: { padding: '5px 10px', borderRadius: 4, backgroundColor: '#1f2937', border: '1px solid #374151', fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' },
  card: { backgroundColor: '#0d1424', border: '1px solid #1f2937', borderRadius: 8, padding: 20 },
  cardTitle: { fontFamily: '"Bebas Neue", monospace', fontSize: 15, letterSpacing: 2, color: '#f59e0b', marginBottom: 14, borderBottom: '1px solid #1f2937', paddingBottom: 8 },
  label: { display: 'block', fontSize: 10, fontFamily: 'monospace', color: '#6b7280', letterSpacing: 1, marginBottom: 6, fontWeight: 700 } as React.CSSProperties,
  input: { width: '100%', padding: '10px 12px', backgroundColor: '#0a0f1a', border: '1px solid #374151', borderRadius: 6, color: '#e5e7eb', fontFamily: 'monospace', fontSize: 13 },
  submitBtn: { width: '100%', padding: '12px', backgroundColor: '#f59e0b', border: 'none', borderRadius: 6, color: '#000', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' },
  successMsg: { padding: '10px 14px', backgroundColor: '#10b98115', border: '1px solid #10b981', borderRadius: 6, color: '#10b981', fontFamily: 'monospace', fontSize: 12 },
  errorMsg: { padding: '10px 14px', backgroundColor: '#ef444415', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', fontFamily: 'monospace', fontSize: 12 },
  warningMsg: { padding: '10px 14px', backgroundColor: '#f59e0b15', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', fontFamily: 'monospace', fontSize: 12 },
  centerBox: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: 420 },
  title: { fontFamily: '"Bebas Neue", monospace', fontSize: 40, letterSpacing: 4, color: '#f9fafb', marginBottom: 8, lineHeight: 1.1 },
  subtitle: { color: '#6b7280', fontSize: 13, fontFamily: 'monospace', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#1f2937', margin: '24px 0' },
  connectBtn: { padding: '12px 32px', backgroundColor: '#f59e0b', border: 'none', borderRadius: 6, color: '#000', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 2 },
};
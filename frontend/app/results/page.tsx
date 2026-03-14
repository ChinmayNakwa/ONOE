// web/app/results/page.tsx
'use client';
import { useReadContract, useReadContracts } from 'wagmi';
import { ONOE_ABI } from '../abi';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const STATE_LABELS = ['NOT STARTED', 'REGISTRATION', 'VOTING', 'REVEALING', 'ENDED'];
const STATE_COLORS = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

type Candidate = { id: number; name: string; party: string; constituencyId: number; isMP: boolean; voteCount: number; };

export default function ResultsPage() {
  // ── ALL hooks unconditionally ─────────────────────────────────────────────
  const { data: electionState } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'state',
  });

  const { data: candidateCount, isLoading: countLoading } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'candidateCount',
  });

  const totalCandidates = candidateCount ? Math.min(Number(candidateCount), 50) : 0;

  const { data: candidatesData, isLoading: candidatesLoading } = useReadContracts({
    contracts: Array.from({ length: totalCandidates }, (_, i) => ({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI,
      functionName: 'candidates' as const, args: [BigInt(i + 1)] as [bigint],
    })),
    query: { enabled: totalCandidates > 0 },
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const currentState = electionState !== undefined ? Number(electionState) : -1;

  const candidates: Candidate[] = (candidatesData ?? [])
    .map(r => {
      if (r.status !== 'success' || !r.result) return null;
      const [id, name, party, constituencyId, isMP, voteCount] = r.result as [bigint, string, string, bigint, boolean, bigint];
      if (!name) return null;
      return { id: Number(id), name, party, constituencyId: Number(constituencyId), isMP, voteCount: Number(voteCount) };
    }).filter(Boolean) as Candidate[];

  const mpCandidates = [...candidates.filter(c => c.isMP)].sort((a, b) => b.voteCount - a.voteCount);
  const mlaCandidates = [...candidates.filter(c => !c.isMP)].sort((a, b) => b.voteCount - a.voteCount);
  const maxVotes = Math.max(1, ...candidates.map(c => c.voteCount));
  const totalVotesCast = Math.floor(candidates.reduce((s, c) => s + c.voteCount, 0) / 2);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (countLoading || (totalCandidates > 0 && candidatesLoading)) return (
    <div style={styles.page}>
      <div style={styles.grain} />
      <div style={styles.centerBox}>
        <div style={{ fontFamily: '"Bebas Neue", monospace', fontSize: 24, letterSpacing: 3, color: '#f59e0b' }}>LOADING RESULTS...</div>
        <div style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}>Fetching on-chain data</div>
      </div>
      <GlobalStyles />
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.grain} />

      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <div style={styles.headerTitle}>ELECTION RESULTS</div>
            <div style={styles.headerSub}>One Nation, One Election · Live Vote Counts</div>
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
          <a href="/" style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: 11, textDecoration: 'none', padding: '5px 12px', border: '1px solid #f59e0b40', borderRadius: 4 }}>← VOTE</a>
          <a href="/admin" style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 11, textDecoration: 'none', padding: '5px 12px', border: '1px solid #374151', borderRadius: 4 }}>ADMIN</a>
        </div>
      </header>

      <main style={{ padding: '24px 32px', position: 'relative', zIndex: 1 }}>

        {/* Warning if not in revealing/ended phase */}
        {currentState >= 0 && currentState < 3 && (
          <div style={{ ...styles.warningMsg, marginBottom: 24 }}>
            ⚠ Final results are tallied after the REVEALING phase. Current phase: {STATE_LABELS[currentState]}. Counts below may be 0.
          </div>
        )}

        {/* No candidates */}
        {candidates.length === 0 ? (
          <div style={{ ...styles.card, textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗳</div>
            <div style={{ fontFamily: '"Bebas Neue", monospace', fontSize: 24, color: '#4b5563', letterSpacing: 2 }}>NO CANDIDATES REGISTERED</div>
            <p style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}>Ask the admin to add candidates first.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'TOTAL CANDIDATES', value: candidates.length, color: '#f59e0b' },
                { label: 'MP CANDIDATES', value: mpCandidates.length, color: '#3b82f6' },
                { label: 'MLA CANDIDATES', value: mlaCandidates.length, color: '#8b5cf6' },
                { label: 'VOTES CAST', value: totalVotesCast, color: '#10b981' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
                  <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Results */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[{ title: 'LOK SABHA (MP)', list: mpCandidates, color: '#3b82f6', accent: '#3b82f622' },
                { title: 'VIDHAN SABHA (MLA)', list: mlaCandidates, color: '#8b5cf6', accent: '#8b5cf622' }]
                .map(({ title, list, color, accent }) => (
                  <div key={title} style={styles.card}>
                    <div style={styles.cardTitle}>{title}</div>
                    {list.length === 0 ? (
                      <div style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>NO CANDIDATES</div>
                    ) : list.map((c, i) => (
                      <div key={c.id} style={{ marginBottom: 16 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 12px', borderRadius: 6, marginBottom: 6,
                          backgroundColor: i === 0 && c.voteCount > 0 ? accent : 'transparent',
                          border: `1px solid ${i === 0 && c.voteCount > 0 ? color : 'transparent'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {i === 0 && c.voteCount > 0 && <span>👑</span>}
                            <div>
                              <div style={{ color: '#f9fafb', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                              <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{c.party} · C{c.constituencyId}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color, fontFamily: 'monospace', fontWeight: 700, fontSize: 20 }}>{c.voteCount}</div>
                            <div style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}>VOTES</div>
                          </div>
                        </div>
                        <div style={{ height: 4, backgroundColor: '#1f2937', borderRadius: 2 }}>
                          <div style={{ height: 4, width: `${(c.voteCount / maxVotes) * 100}%`, backgroundColor: color, borderRadius: 2, transition: 'width 0.7s ease', minWidth: c.voteCount > 0 ? 4 : 0 }} />
                        </div>
                      </div>
                    ))}
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
  card: { backgroundColor: '#0d1424', border: '1px solid #1f2937', borderRadius: 8, padding: 20 },
  cardTitle: { fontFamily: '"Bebas Neue", monospace', fontSize: 15, letterSpacing: 2, color: '#f59e0b', marginBottom: 14, borderBottom: '1px solid #1f2937', paddingBottom: 8 },
  warningMsg: { padding: '10px 14px', backgroundColor: '#f59e0b15', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', fontFamily: 'monospace', fontSize: 12 },
  centerBox: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' },
};
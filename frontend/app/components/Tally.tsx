'use client';

import { colors, fonts } from '../lib/theme';
import type { Candidate } from '../lib/useElection';
import { Card } from './ui';

// Vote counts for one race (for example the MPs of one constituency), with bars and a leader marker.
export function Tally({ title, candidates, accent, final }: { title: string; candidates: Candidate[]; accent: string; final: boolean }) {
  const sorted = [...candidates].sort((a, b) => b.voteCount - a.voteCount);
  const total = sorted.reduce((sum, c) => sum + c.voteCount, 0);
  const topVotes = sorted[0]?.voteCount ?? 0;
  const leaders = topVotes > 0 ? sorted.filter(c => c.voteCount === topVotes) : [];

  return (
    <Card title={title}>
      {sorted.length === 0 ? (
        <p style={{ color: colors.faint, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>NO CANDIDATES</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {sorted.map(c => {
            const isLeader = leaders.some(l => l.id === c.id);
            const percent = total > 0 ? Math.round((c.voteCount / total) * 100) : 0;
            const badge = leaders.length > 1 ? 'TIED' : final ? 'WINNER' : 'LEADING';
            return (
              <div key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                  <span style={{ color: colors.textStrong, fontSize: 14, fontWeight: 600 }}>
                    {c.name} <span style={{ color: colors.faint, fontSize: 11, fontWeight: 400 }}>({c.party})</span>
                    {isLeader && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: accent, border: `1px solid ${accent}`, borderRadius: 3, padding: '1px 5px' }}>
                        {badge}
                      </span>
                    )}
                  </span>
                  <span style={{ color: accent, fontFamily: fonts.mono, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {c.voteCount} <span style={{ color: colors.faint, fontSize: 10, fontWeight: 400 }}>{percent}%</span>
                  </span>
                </div>
                <div style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                  <div style={{ height: 6, width: `${percent}%`, backgroundColor: accent, borderRadius: 3, transition: 'width 0.5s', minWidth: c.voteCount > 0 ? 4 : 0 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

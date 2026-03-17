'use client';

import { Header } from '../components/Header';
import { SetupBanners, Shell } from '../components/Shell';
import { Tally } from '../components/Tally';
import { Banner, Card, Stat } from '../components/ui';
import { constituencyName } from '../lib/constants';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { PHASE_COLORS, colors, fonts } from '../lib/theme';
import { useElection } from '../lib/useElection';

export default function ResultsPage() {
  const { phase, candidates, totalRevealed, isLoading, isError, lastUpdated } = useElection();

  const constituencyIds = [...new Set(candidates.map(c => c.constituencyId))].sort((a, b) => a - b);
  const final = phase === 4;

  return (
    <Shell>
      <Header title="ELECTION RESULTS" subtitle="One Nation, One Election · Live vote counts" active="results" phase={phase} />

      <main className="onoe-main">
        <SetupBanners />

        {isError && !!CONTRACT_ADDRESS && (
          <Banner kind="error" style={{ marginBottom: 16 }}>
            Cannot read the election contract. Is Anvil running, and is NEXT_PUBLIC_CONTRACT_ADDRESS the address of the latest deployment?
          </Banner>
        )}

        {isLoading ? (
          <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 24, letterSpacing: 3, color: colors.amber }}>LOADING RESULTS…</div>
            <p style={{ color: colors.faint, fontSize: 12, marginTop: 8 }}>Reading the blockchain</p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {phase >= 0 && phase < 3 && (
              <Banner kind="info">
                Votes are only counted once voters reveal them, so every tally stays at 0 until the REVEALING phase.
              </Banner>
            )}
            {phase === 3 && <Banner kind="warning">Revealing is in progress. These counts are provisional until the election ends.</Banner>}
            {final && <Banner kind="success">The election has ended. These results are final.</Banner>}

            <div className="onoe-stats">
              <Stat label="VOTERS COUNTED" value={totalRevealed} color={colors.green} />
              <Stat label="MP CANDIDATES" value={candidates.filter(c => c.isMP).length} color={colors.blue} />
              <Stat label="MLA CANDIDATES" value={candidates.filter(c => !c.isMP).length} color={colors.purple} />
              <Stat label="PHASE" value={phase >= 0 ? ['—', '1', '2', '3', '4'][phase] + '/4' : '…'} color={phase >= 0 ? PHASE_COLORS[phase] : colors.faint} />
            </div>

            {candidates.length === 0 ? (
              <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🗳</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 24, color: colors.faint, letterSpacing: 2 }}>NO CANDIDATES REGISTERED</div>
                <p style={{ color: colors.faint, fontSize: 12, marginTop: 8 }}>The admin has not added any candidates yet.</p>
              </Card>
            ) : (
              constituencyIds.map(id => (
                <section key={id} aria-label={constituencyName(id)}>
                  <h2 style={{ fontFamily: fonts.heading, fontSize: 20, letterSpacing: 2, color: colors.textStrong, marginBottom: 10 }}>
                    {constituencyName(id).toUpperCase()} <span style={{ color: colors.faint, fontSize: 14 }}>· CONSTITUENCY {id}</span>
                  </h2>
                  <div className="onoe-grid">
                    <Tally title="LOK SABHA (MP)" accent={colors.blue} final={final} candidates={candidates.filter(c => c.constituencyId === id && c.isMP)} />
                    <Tally title="VIDHAN SABHA (MLA)" accent={colors.purple} final={final} candidates={candidates.filter(c => c.constituencyId === id && !c.isMP)} />
                  </div>
                </section>
              ))
            )}

            {lastUpdated > 0 && (
              <p style={{ color: colors.faint, fontSize: 11, textAlign: 'right' }}>
                Updates every 3 seconds · last updated {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </main>
    </Shell>
  );
}

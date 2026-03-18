'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { encodePacked, keccak256 } from 'viem';
import { Header } from './components/Header';
import { ConnectPrompt, SetupBanners, Shell } from './components/Shell';
import { Banner, Button, Card, Stepper } from './components/ui';
import { CHAIN_ID, constituencyName } from './lib/constants';
import { CONTRACT_ADDRESS, ONOE_ABI, friendlyError } from './lib/contract';
import { colors, fonts } from './lib/theme';
import { useElection, type Candidate } from './lib/useElection';
import { useMounted } from './lib/useMounted';
import {
  clearSession, downloadReceipt, loadSession, newSalt, parseReceipt, saveSession, type VoteSession,
} from './lib/voteSession';

const STEPS = ['Verify identity', 'Choose candidates', 'Vote sealed', 'Vote counted'];

export default function VoterPage() {
  // ── All hooks first, early returns after ──────────────────────────────────
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const election = useElection();

  const { writeContract, data: txHash, isPending: walletOpen, error: txError, reset: resetTx } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const [session, setSession] = useState<VoteSession | null>(null);
  const [selectedMP, setSelectedMP] = useState(0);
  const [selectedMLA, setSelectedMLA] = useState(0);
  const [action, setAction] = useState<'seal' | 'reveal' | null>(null);

  const [voterId, setVoterId] = useState('');
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // What the chain says about this wallet is the source of truth for progress.
  const poll = { enabled: !!address && !!CONTRACT_ADDRESS, refetchInterval: 3000 };
  const votedRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'hasVoted', args: [address as `0x${string}`], query: poll });
  const revealedRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'hasRevealed', args: [address as `0x${string}`], query: poll });

  // Load this wallet's saved session whenever the connected wallet changes.
  useEffect(() => {
    const saved = address ? loadSession(address, CONTRACT_ADDRESS) : null;
    setSession(saved);
    setSelectedMP(saved?.mpId ?? 0);
    setSelectedMLA(saved?.mlaId ?? 0);
    setAuthError('');
    setReceiptError('');
    resetTx();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(timer);
  }, []);

  // A mined transaction can still have reverted, so check the status before trusting it.
  const mined = receipt.data?.status === 'success';
  const reverted = receipt.data?.status === 'reverted';

  // After a transaction is mined, refresh progress and clean up.
  useEffect(() => {
    if (!receipt.isSuccess) return;
    votedRead.refetch();
    revealedRead.refetch();
    election.refetch();
    if (mined && action === 'reveal' && address) {
      clearSession(address, CONTRACT_ADDRESS); // the secret is no longer needed
      setSession(null);
    }
  }, [receipt.isSuccess, mined]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ────────────────────────────────────────────────────────
  const committed = votedRead.data === true;
  const revealed = revealedRead.data === true;
  const step = revealed ? 3 : committed ? 2 : session ? 1 : 0;

  const slipExpired = !!session && !committed && session.deadline < now;
  const busy = walletOpen || (!!txHash && receipt.isLoading);
  const wrongNetwork = chainId !== CHAIN_ID;
  const statusLoading = !!address && (votedRead.isLoading || revealedRead.isLoading);

  const myCandidates = session ? election.candidates.filter(c => c.constituencyId === session.constituencyId) : [];
  const mpOptions = myCandidates.filter(c => c.isMP);
  const mlaOptions = myCandidates.filter(c => !c.isMP);
  const chosenMP = mpOptions.find(c => c.id === selectedMP);
  const chosenMLA = mlaOptions.find(c => c.id === selectedMLA);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!address) return;
    setAuthError('');
    setVerifying(true);
    try {
      const res = await fetch('/api/auth-voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId, pin, walletAddress: address }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setAuthError(data.error || 'Verification failed.');
        return;
      }
      const fresh: VoteSession = {
        wallet: address, contract: CONTRACT_ADDRESS,
        constituencyId: data.constituencyId, nullifier: data.nullifier,
        deadline: data.deadline, signature: data.signature,
        salt: newSalt(), mpId: 0, mlaId: 0,
      };
      saveSession(fresh);
      setSession(fresh);
      setPin('');
    } catch {
      setAuthError('Could not reach the government node. Check that the app server is running.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSeal = () => {
    if (!session || !address || !chosenMP || !chosenMLA) return;
    // Save the choices and salt BEFORE sending the transaction, so a crash or reload cannot lose them.
    const sealed: VoteSession = { ...session, mpId: chosenMP.id, mlaId: chosenMLA.id };
    saveSession(sealed);
    setSession(sealed);

    const commitment = keccak256(encodePacked(
      ['uint256', 'uint256', 'uint256', 'address', 'bytes32'],
      [BigInt(sealed.mpId), BigInt(sealed.mlaId), BigInt(sealed.constituencyId), address, sealed.salt]
    ));
    setAction('seal');
    resetTx();
    writeContract({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'commitVote',
      args: [commitment, BigInt(sealed.constituencyId), sealed.nullifier, BigInt(sealed.deadline), sealed.signature],
    });
  };

  const handleReveal = () => {
    if (!session || !session.mpId || !session.mlaId) return;
    setAction('reveal');
    resetTx();
    writeContract({
      address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'revealVote',
      args: [BigInt(session.mpId), BigInt(session.mlaId), BigInt(session.constituencyId), session.salt],
    });
  };

  const handleImportReceipt = async (file: File | undefined) => {
    setReceiptError('');
    if (!file || !address) return;
    const imported = parseReceipt(await file.text());
    if (!imported) return setReceiptError('That file is not a valid vote receipt.');
    if (imported.wallet.toLowerCase() !== address.toLowerCase()) return setReceiptError('This receipt belongs to a different wallet.');
    if (imported.contract.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) return setReceiptError('This receipt is for a different election contract.');
    saveSession(imported);
    setSession(imported);
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────────────
  if (!mounted) return null;

  if (!isConnected) return (
    <Shell>
      <ConnectPrompt icon="🗳" title="ONE NATION, ONE ELECTION" subtitle="Secure blockchain voting portal" button="CONNECT WALLET TO VOTE" />
    </Shell>
  );

  const phase = election.phase;

  return (
    <Shell>
      <Header title="ONE NATION, ONE ELECTION" subtitle="Secure blockchain voting portal" active="vote" phase={phase} />

      <main className="onoe-main" style={{ maxWidth: 900 }}>
        <SetupBanners />
        {election.isError && !wrongNetwork && !!CONTRACT_ADDRESS && (
          <Banner kind="error" style={{ marginBottom: 16 }}>
            Cannot read the election contract. Is Anvil running, and is NEXT_PUBLIC_CONTRACT_ADDRESS the address of the latest deployment?
          </Banner>
        )}

        <div style={{ marginBottom: 24 }}><Stepper steps={STEPS} current={step} /></div>

        {statusLoading && <Card><p style={{ color: colors.muted, fontSize: 13 }}>Checking your voting status on-chain…</p></Card>}

        {/* STEP 1: verify */}
        {!statusLoading && step === 0 && (
          <Card title="VERIFY YOUR IDENTITY">
            {phase !== 2 && phase >= 0 && (
              <Banner kind="warning" style={{ marginBottom: 16 }}>
                {phase < 2 ? 'Voting has not opened yet. Come back when the election is in the VOTING phase.' :
                 phase === 3 ? 'Voting is closed and the election is in the REVEALING phase.' : 'The election has ended.'}
              </Banner>
            )}
            <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Enter the Voter ID and PIN on your voter card. The government node checks them and gives your wallet a
              signed slip that lets it cast exactly one vote. Your ID is never written to the blockchain.
            </p>
            <form onSubmit={e => { e.preventDefault(); handleVerify(); }} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label htmlFor="voter-id" style={labelStyle}>VOTER ID</label>
                <input id="voter-id" style={inputStyle} placeholder="e.g. VARANASI01" autoComplete="off"
                  value={voterId} onChange={e => setVoterId(e.target.value)} />
              </div>
              <div>
                <label htmlFor="voter-pin" style={labelStyle}>PIN</label>
                <input id="voter-pin" style={inputStyle} type="password" placeholder="Your PIN" autoComplete="off"
                  value={pin} onChange={e => setPin(e.target.value)} />
              </div>
              {authError && <Banner kind="error">✗ {authError}</Banner>}
              <Button type="submit" full loading={verifying} disabled={!voterId.trim() || !pin.trim() || phase !== 2}>
                VERIFY WITH GOVERNMENT NODE
              </Button>
            </form>
          </Card>
        )}

        {/* STEP 2: choose and seal */}
        {!statusLoading && step === 1 && session && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Banner kind="success">
              ✓ Verified · {constituencyName(session.constituencyId)} (constituency {session.constituencyId}) ·
              slip valid for {Math.max(0, Math.ceil((session.deadline - now) / 60))} more min
            </Banner>

            {slipExpired && (
              <Banner kind="warning">
                Your voter slip has expired.{' '}
                <button onClick={() => { clearSession(session.wallet, session.contract); setSession(null); }} style={linkButton}>
                  Verify again
                </button>
              </Banner>
            )}
            {phase !== 2 && phase >= 0 && <Banner kind="warning">Voting is not open right now (phase: {['not started', 'registration', 'voting', 'revealing', 'ended'][phase]}).</Banner>}

            <div className="onoe-grid">
              <CandidateList title="LOK SABHA (MP)" accent={colors.blue} list={mpOptions} selected={selectedMP} onSelect={setSelectedMP} name="mp" />
              <CandidateList title="VIDHAN SABHA (MLA)" accent={colors.purple} list={mlaOptions} selected={selectedMLA} onSelect={setSelectedMLA} name="mla" />
            </div>

            <Card title="YOUR BALLOT">
              {chosenMP && chosenMLA ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.8 }}>
                    MP: <b style={{ color: colors.textStrong }}>{chosenMP.name}</b> ({chosenMP.party})<br />
                    MLA: <b style={{ color: colors.textStrong }}>{chosenMLA.name}</b> ({chosenMLA.party})
                  </p>
                  <Banner kind="info">
                    Sealing publishes only a scrambled fingerprint of your choices. You cannot change them afterwards,
                    and you will need to come back during the REVEALING phase to get them counted.
                  </Banner>
                  {txError && <Banner kind="error">✗ {friendlyError(txError)}</Banner>}
                  {reverted && <Banner kind="error">✗ The transaction was mined but failed on-chain. Your saved vote secret is untouched, so you can try again.</Banner>}
                  {busy && <Banner kind="info">{walletOpen ? 'Confirm the transaction in your wallet…' : 'Waiting for the chain to confirm…'}</Banner>}
                  <Button full loading={busy} onClick={handleSeal} disabled={slipExpired || phase !== 2 || wrongNetwork}>
                    🔒 SEAL MY VOTE
                  </Button>
                </div>
              ) : (
                <p style={{ color: colors.faint, fontSize: 13 }}>Pick one MP and one MLA above to review your ballot.</p>
              )}
            </Card>
          </div>
        )}

        {/* STEP 3: sealed, waiting to reveal */}
        {!statusLoading && step === 2 && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Card title="YOUR VOTE IS SEALED">
              {session ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: colors.muted }}>
                    Your sealed vote is recorded on the blockchain. {phase === 3
                      ? 'The REVEALING phase is open: reveal your vote now so it gets counted.'
                      : phase === 4
                        ? 'The election ended before you revealed, so your vote was not counted.'
                        : 'Come back when the admin opens the REVEALING phase and press Reveal.'}
                  </p>
                  {txError && <Banner kind="error">✗ {friendlyError(txError)}</Banner>}
                  {reverted && <Banner kind="error">✗ The transaction was mined but failed on-chain. Your saved vote secret is untouched, so you can try again.</Banner>}
                  {busy && <Banner kind="info">{walletOpen ? 'Confirm the transaction in your wallet…' : 'Waiting for the chain to confirm…'}</Banner>}
                  <Button full loading={busy} onClick={handleReveal} disabled={phase !== 3 || wrongNetwork}>
                    🔓 REVEAL MY VOTE
                  </Button>
                  <Banner kind="warning">
                    Your browser holds the secret needed to reveal. Download a receipt as a backup and keep it private.{' '}
                    <button onClick={() => downloadReceipt(session)} style={linkButton}>Download receipt</button>
                  </Banner>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  <Banner kind="warning">
                    This wallet has a sealed vote, but this browser no longer has the secret needed to reveal it.
                    Import the receipt file you downloaded earlier.
                  </Banner>
                  <input type="file" accept="application/json,.json" aria-label="Vote receipt file"
                    onChange={e => handleImportReceipt(e.target.files?.[0])} style={{ fontSize: 12, color: colors.muted }} />
                  {receiptError && <Banner kind="error">✗ {receiptError}</Banner>}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* STEP 4: counted */}
        {!statusLoading && step === 3 && (
          <Card style={{ textAlign: 'center', borderColor: colors.green }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗳</div>
            <div style={{ fontFamily: fonts.heading, fontSize: 30, letterSpacing: 2, color: colors.green, marginBottom: 8 }}>VOTE COUNTED</div>
            <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20 }}>
              Thank you for taking part. Your MP and MLA votes are now part of the public tally.
            </p>
            <a href="/results" style={{ display: 'inline-block', padding: '10px 24px', backgroundColor: colors.amber, color: '#000', borderRadius: 6, fontWeight: 700, fontSize: 12, textDecoration: 'none', letterSpacing: 1 }}>
              VIEW LIVE RESULTS →
            </a>
          </Card>
        )}
      </main>
    </Shell>
  );
}

function CandidateList({ title, accent, list, selected, onSelect, name }: {
  title: string; accent: string; list: Candidate[]; selected: number; onSelect: (id: number) => void; name: string;
}) {
  return (
    <Card title={title}>
      {list.length === 0 ? (
        <p style={{ color: colors.faint, fontSize: 12 }}>No candidates registered in your constituency.</p>
      ) : (
        <div role="radiogroup" aria-label={title} style={{ display: 'grid', gap: 8 }}>
          {list.map(c => (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${selected === c.id ? accent : colors.border}`,
              backgroundColor: selected === c.id ? accent + '15' : colors.bg,
            }}>
              <input type="radio" name={name} checked={selected === c.id} onChange={() => onSelect(c.id)} style={{ accentColor: accent }} />
              <div>
                <div style={{ color: colors.textStrong, fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: colors.faint, fontSize: 11 }}>{c.party}</div>
              </div>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

const labelStyle = { display: 'block', fontSize: 10, color: colors.faint, letterSpacing: 1, marginBottom: 6, fontWeight: 700 } as const;
const inputStyle = {
  width: '100%', padding: '10px 12px', backgroundColor: colors.bg, border: `1px solid ${colors.borderStrong}`,
  borderRadius: 6, color: colors.text, fontFamily: fonts.mono, fontSize: 13,
} as const;
const linkButton = { background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 700 } as const;

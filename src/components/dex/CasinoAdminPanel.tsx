import { useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { CONTRACTS, CHAIN_CONFIG } from '@/config/contracts';
import { CASINO_ABI } from '@/config/abis';

interface SettledRow {
  player: string;
  game: string;
  payout: string;
  win: boolean;
  txHash: string;
  block: number;
}

export default function CasinoAdminPanel() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);

  const [owner, setOwner] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [history, setHistory] = useState<SettledRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form states
  const [depositAmt, setDepositAmt] = useState('0.1');
  const [withdrawAmt, setWithdrawAmt] = useState('0.1');
  const [minBet, setMinBet] = useState('');
  const [maxBet, setMaxBet] = useState('');
  const [houseEdge, setHouseEdge] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [gameFilter, setGameFilter] = useState<string>('all');

  const isAdmin = useMemo(() =>
    !!owner && !!wallet.address &&
    owner.toLowerCase() === wallet.address.toLowerCase(),
  [owner, wallet.address]);

  // Resolve owner once we have a provider
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const o = await casino.getOwner();
        if (!cancelled) setOwner(o);
      } catch {
        if (!cancelled) setOwner(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.signer, wallet.address]);

  // Pre-fill setters with current values
  useEffect(() => {
    if (casino.stats.minBet && !minBet) setMinBet(casino.stats.minBet);
    if (casino.stats.maxBet && !maxBet) setMaxBet(casino.stats.maxBet);
    if (casino.stats.houseEdgeBP && !houseEdge) setHouseEdge(String(casino.stats.houseEdgeBP));
  }, [casino.stats.minBet, casino.stats.maxBet, casino.stats.houseEdgeBP, minBet, maxBet, houseEdge]);

  // Stream GameSettled history (last ~5000 blocks)
  const loadedRef = useRef(false);
  const loadHistory = async (force = false) => {
    if (!isAdmin) return;
    if (loadedRef.current && !force) return;
    loadedRef.current = true;
    setHistoryLoading(true);
    try {
        const provider = wallet.signer?.provider
          ?? new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
        const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, provider);
        const head = await provider.getBlockNumber();
        const from = Math.max(0, head - 5000);
        const filter = c.filters.GameSettled();
        const logs = await c.queryFilter(filter, from, head);
        const rows: SettledRow[] = logs.slice(-100).reverse().map(l => ({
          player: l.args!.player as string,
          game: l.args!.game as string,
          payout: ethers.utils.formatEther(l.args!.payout),
          win: l.args!.win as boolean,
          txHash: l.transactionHash,
          block: l.blockNumber,
        }));
        setHistory(rows);
    } catch {
      toast.error('Failed to load event history');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadHistory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, wallet.address]);

  // Per-game aggregate
  const perGame = useMemo(() => {
    const map = new Map<string, { plays: number; wins: number; payout: number }>();
    for (const r of history) {
      const cur = map.get(r.game) ?? { plays: 0, wins: 0, payout: 0 };
      cur.plays += 1;
      if (r.win) cur.wins += 1;
      cur.payout += parseFloat(r.payout);
      map.set(r.game, cur);
    }
    return Array.from(map.entries())
      .map(([game, v]) => ({ game, ...v, winRate: v.plays ? (v.wins / v.plays) * 100 : 0 }))
      .sort((a, b) => b.plays - a.plays);
  }, [history]);

  const filteredHistory = useMemo(() => history.filter(h => {
    if (historyFilter === 'win' && !h.win) return false;
    if (historyFilter === 'loss' && h.win) return false;
    if (gameFilter !== 'all' && h.game !== gameFilter) return false;
    return true;
  }), [history, historyFilter, gameFilter]);

  const exportCSV = () => {
    if (history.length === 0) { toast.error('Nothing to export'); return; }
    const header = 'block,player,game,payout_zkLTC,result,tx_hash\n';
    const rows = history.map(h =>
      `${h.block},${h.player},${h.game},${h.payout},${h.win ? 'WIN' : 'LOSS'},${h.txHash}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `casino-events-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${history.length} rows`);
  };

  const bankrollHealth = useMemo(() => {
    const b = parseFloat(casino.stats.bankroll);
    const m = parseFloat(casino.stats.maxBet);
    if (!m) return { ratio: 0, label: 'Unknown', color: 'text-muted-foreground' };
    const ratio = b / m;
    if (ratio >= 50) return { ratio, label: 'Healthy', color: 'text-wolf-green' };
    if (ratio >= 20) return { ratio, label: 'Adequate', color: 'text-wolf-gold' };
    return { ratio, label: 'Low — top up', color: 'text-wolf-pink' };
  }, [casino.stats.bankroll, casino.stats.maxBet]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusyAction(label);
    try {
      const hash = await fn();
      toast.success(
        <span>
          {label} confirmed —{' '}
          <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">
            view tx
          </a>
        </span>
      );
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.reason || e?.message || `${label} failed`);
    } finally {
      setBusyAction(null);
    }
  };

  // ===== Render: not connected =====
  if (!wallet.isConnected) {
    return (
      <div className="casino-card p-8 text-center">
        <div className="text-5xl mb-3">🔐</div>
        <h2 className="text-xl font-bold mb-2">Wallet Required</h2>
        <p className="text-muted-foreground mb-4">Connect the casino owner wallet to access the admin panel.</p>
        <Link to="/casino" className="text-wolf-pink hover:text-wolf-gold transition-colors">← Back to Casino</Link>
      </div>
    );
  }

  // ===== Render: checking ownership =====
  if (checking) {
    return (
      <div className="casino-card p-8 text-center">
        <div className="w-8 h-8 mx-auto border-2 border-wolf-gold border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-muted-foreground">Verifying owner on-chain…</p>
      </div>
    );
  }

  // ===== Render: not admin =====
  if (!isAdmin) {
    return (
      <div className="casino-card p-8 text-center max-w-xl mx-auto">
        <div className="text-5xl mb-3">⛔</div>
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">
          Only the contract owner can access this panel.
        </p>
        <div className="text-xs font-mono space-y-1 bg-wolf-surface p-3 rounded-lg border border-wolf-border/40">
          <div><span className="text-muted-foreground">Owner:</span> {owner ?? '—'}</div>
          <div><span className="text-muted-foreground">You:</span> {wallet.address}</div>
        </div>
        <div className="mt-4">
          <Link to="/casino" className="text-wolf-pink hover:text-wolf-gold transition-colors">← Back to Casino</Link>
        </div>
      </div>
    );
  }

  // ===== Render: admin =====
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold casino-title">🐺 Casino Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner: <span className="font-mono text-wolf-gold">{wallet.address?.slice(0, 8)}…{wallet.address?.slice(-6)}</span>
          </p>
        </div>
        <Link to="/casino" className="text-sm text-wolf-pink hover:text-wolf-gold transition-colors">← Back to Casino</Link>
      </div>

      {/* Stats Dashboard */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Bankroll" value={`${parseFloat(casino.stats.bankroll).toFixed(4)} zkLTC`} accent="gold" />
        <StatCard label="Min Bet" value={`${parseFloat(casino.stats.minBet).toFixed(6)} zkLTC`} />
        <StatCard label="Max Bet" value={`${parseFloat(casino.stats.maxBet).toFixed(2)} zkLTC`} />
        <StatCard label="House Edge" value={`${(casino.stats.houseEdgeBP / 100).toFixed(2)}%`} />
        <StatCard label="Status" value={casino.stats.isActive ? 'ACTIVE' : 'PAUSED'} accent={casino.stats.isActive ? 'green' : 'pink'} />
        <StatCard label="Total Games (recent)" value={String(history.length)} />
        <StatCard label="Wins (recent)" value={String(history.filter(h => h.win).length)} accent="green" />
        <StatCard label="Total Payout (recent)" value={`${history.reduce((s, h) => s + parseFloat(h.payout), 0).toFixed(4)} zkLTC`} accent="gold" />
      </section>

      {/* Bankroll health */}
      <section className="casino-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">🩺 Bankroll Health</h3>
          <span className={`text-xs font-semibold ${bankrollHealth.color}`}>
            {bankrollHealth.label} · {bankrollHealth.ratio.toFixed(1)}× max bet
          </span>
        </div>
        <div className="h-2 rounded-full bg-wolf-surface overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (bankrollHealth.ratio / 100) * 100)}%`,
              background: 'linear-gradient(90deg, oklch(0.78 0.16 85), oklch(0.65 0.25 330))',
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          A healthy bankroll covers ≥50× the max bet so payouts never get capped.
        </p>
      </section>

      {/* Bankroll mgmt */}
      <section className="grid md:grid-cols-2 gap-4">
        <AdminCard title="💰 Deposit to Bankroll" desc="Top up the casino contract balance.">
          <AmountInput value={depositAmt} onChange={setDepositAmt} suffix="zkLTC" />
          <ActionButton
            label={busyAction === 'Deposit' ? 'Depositing…' : `Deposit ${depositAmt} zkLTC`}
            disabled={!!busyAction}
            onClick={() => run('Deposit', () => casino.deposit(depositAmt))}
            variant="gold"
          />
        </AdminCard>

        <AdminCard title="📤 Withdraw from Bankroll" desc="Withdraw funds to owner wallet.">
          <AmountInput value={withdrawAmt} onChange={setWithdrawAmt} suffix="zkLTC" />
          <ActionButton
            label={busyAction === 'Withdraw' ? 'Withdrawing…' : `Withdraw ${withdrawAmt} zkLTC`}
            disabled={!!busyAction}
            onClick={() => run('Withdraw', () => casino.withdraw(withdrawAmt))}
            variant="pink"
          />
        </AdminCard>
      </section>

      {/* Contract settings */}
      <section className="grid md:grid-cols-3 gap-4">
        <AdminCard title="⚙️ Min Bet" desc="Minimum bet per play (zkLTC).">
          <AmountInput value={minBet} onChange={setMinBet} suffix="zkLTC" />
          <ActionButton
            label={busyAction === 'setMinBet' ? 'Setting…' : 'Update Min Bet'}
            disabled={!!busyAction}
            onClick={() => run('setMinBet', () => casino.adminCall('setMinBet', [ethers.utils.parseEther(minBet)]))}
          />
        </AdminCard>

        <AdminCard title="⚙️ Max Bet" desc="Maximum bet per play (zkLTC).">
          <AmountInput value={maxBet} onChange={setMaxBet} suffix="zkLTC" />
          <ActionButton
            label={busyAction === 'setMaxBet' ? 'Setting…' : 'Update Max Bet'}
            disabled={!!busyAction}
            onClick={() => run('setMaxBet', () => casino.adminCall('setMaxBet', [ethers.utils.parseEther(maxBet)]))}
          />
        </AdminCard>

        <AdminCard title="⚙️ House Edge" desc="Basis points (100 = 1%).">
          <AmountInput value={houseEdge} onChange={setHouseEdge} suffix="BP" type="number" />
          <ActionButton
            label={busyAction === 'setHouseEdge' ? 'Setting…' : 'Update Edge'}
            disabled={!!busyAction}
            onClick={() => run('setHouseEdge', () => casino.adminCall('setHouseEdgeBP', [Math.floor(Number(houseEdge))]))}
          />
        </AdminCard>
      </section>

      {/* Pause / Activate */}
      <section>
        <AdminCard
          title={casino.stats.isActive ? '⏸️ Pause Casino' : '▶️ Activate Casino'}
          desc={casino.stats.isActive ? 'Disables all play* functions until reactivated.' : 'Re-enables all play* functions.'}
        >
          <ActionButton
            label={busyAction === 'setActive'
              ? 'Updating…'
              : casino.stats.isActive ? 'Pause Now' : 'Activate Now'}
            disabled={!!busyAction}
            onClick={() => run('setActive', () => casino.adminCall('setActive', [!casino.stats.isActive]))}
            variant={casino.stats.isActive ? 'pink' : 'green'}
          />
        </AdminCard>
      </section>

      {/* Transfer ownership — danger zone */}
      <section className="casino-card p-5 border-2 border-wolf-pink/40">
        <h3 className="font-bold text-sm flex items-center gap-2">⚠️ Danger Zone — Transfer Ownership</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Hands the contract over to a new owner address. <span className="text-wolf-pink font-semibold">This is irreversible.</span>
        </p>
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            type="text"
            placeholder="0x… new owner address"
            value={newOwner}
            onChange={e => setNewOwner(e.target.value)}
            className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-xl px-3 py-2 font-mono text-xs outline-none focus:border-wolf-pink/60"
          />
          <ActionButton
            label={busyAction === 'transferOwnership' ? 'Transferring…' : 'Transfer Ownership'}
            disabled={!!busyAction || !ethers.utils.isAddress(newOwner)}
            onClick={() => {
              if (!confirm(`Transfer ownership to ${newOwner}?\nThis cannot be undone.`)) return;
              run('transferOwnership', () => casino.adminCall('transferOwnership', [newOwner]));
            }}
            variant="pink"
          />
        </div>
      </section>

      {/* Per-game breakdown */}
      {perGame.length > 0 && (
        <section className="casino-card p-5">
          <h2 className="text-lg font-bold mb-4">🎮 Per-Game Breakdown (recent)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {perGame.map(g => (
              <div key={g.game} className="rounded-xl bg-wolf-surface border border-wolf-border/40 p-3">
                <div className="text-xs font-bold text-wolf-gold">{g.game}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {g.plays} plays · {g.wins} wins
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Win rate: <span className="text-foreground font-semibold">{g.winRate.toFixed(1)}%</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Payout: <span className="text-wolf-gold font-mono">{g.payout.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Event history */}
      <section className="casino-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold">📜 Recent GameSettled Events</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={historyFilter}
              onChange={e => setHistoryFilter(e.target.value as any)}
              className="bg-wolf-surface border border-wolf-border/40 rounded-lg px-2 py-1 text-xs"
            >
              <option value="all">All results</option>
              <option value="win">Wins only</option>
              <option value="loss">Losses only</option>
            </select>
            <select
              value={gameFilter}
              onChange={e => setGameFilter(e.target.value)}
              className="bg-wolf-surface border border-wolf-border/40 rounded-lg px-2 py-1 text-xs"
            >
              <option value="all">All games</option>
              {perGame.map(g => <option key={g.game} value={g.game}>{g.game}</option>)}
            </select>
            <button
              onClick={() => loadHistory(true)}
              disabled={historyLoading}
              className="text-xs px-2 py-1 rounded-lg bg-wolf-surface border border-wolf-border/40 hover:border-wolf-gold/50 hover:text-wolf-gold transition-all disabled:opacity-50"
            >
              {historyLoading ? '⏳' : '🔄'} Refresh
            </button>
            <button
              onClick={exportCSV}
              className="text-xs px-2 py-1 rounded-lg bg-wolf-surface border border-wolf-border/40 hover:border-wolf-gold/50 hover:text-wolf-gold transition-all"
            >
              ⬇ CSV
            </button>
          </div>
        </div>
        {historyLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading on-chain events…</div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No settlements found in the recent window.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground border-b border-wolf-border/40">
                <tr>
                  <th className="py-2 pr-3">Block</th>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Game</th>
                  <th className="py-2 pr-3 text-right">Payout</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((r) => (
                  <tr key={r.txHash} className="border-b border-wolf-border/20 hover:bg-wolf-surface/40">
                    <td className="py-2 pr-3 font-mono">{r.block}</td>
                    <td className="py-2 pr-3 font-mono">{r.player.slice(0, 6)}…{r.player.slice(-4)}</td>
                    <td className="py-2 pr-3">{r.game}</td>
                    <td className="py-2 pr-3 text-right font-mono">{parseFloat(r.payout).toFixed(6)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.win ? 'bg-wolf-green/20 text-wolf-green' : 'bg-wolf-surface text-muted-foreground'
                      }`}>
                        {r.win ? 'WIN' : 'LOSS'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <a
                        href={`${CHAIN_CONFIG.blockExplorer}/tx/${r.txHash}`}
                        target="_blank" rel="noreferrer"
                        className="text-wolf-pink hover:text-wolf-gold transition-colors font-mono"
                      >
                        {r.txHash.slice(0, 8)}… ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11px] text-muted-foreground text-right mt-2">
              Showing {filteredHistory.length} of {history.length} · last 5000 blocks
            </div>
          </div>
        )}
      </section>
    </motion.div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'gold' | 'green' | 'pink' }) {
  const color = accent === 'gold' ? 'text-wolf-gold'
    : accent === 'green' ? 'text-wolf-green'
    : accent === 'pink' ? 'text-wolf-pink'
    : 'text-foreground';
  return (
    <div className="casino-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function AdminCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="casino-card p-5 space-y-3">
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function AmountInput({ value, onChange, suffix, type = 'number' }: {
  value: string; onChange: (v: string) => void; suffix: string; type?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface border border-wolf-border/40 focus-within:border-wolf-gold/60 transition-colors">
      <input
        type={type}
        step="0.000001"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent outline-none flex-1 font-mono text-sm"
      />
      <span className="text-xs text-wolf-gold font-semibold">{suffix}</span>
    </div>
  );
}

function ActionButton({ label, onClick, disabled, variant = 'gold' }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'gold' | 'pink' | 'green';
}) {
  const bg = {
    gold:  'linear-gradient(135deg, oklch(0.78 0.16 85), oklch(0.65 0.25 330))',
    pink:  'linear-gradient(135deg, oklch(0.65 0.25 330), oklch(0.55 0.25 25))',
    green: 'linear-gradient(135deg, oklch(0.60 0.22 150), oklch(0.55 0.20 200))',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 rounded-xl font-semibold text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: bg, color: 'oklch(0.10 0.02 280)' }}
    >
      {label}
    </button>
  );
}

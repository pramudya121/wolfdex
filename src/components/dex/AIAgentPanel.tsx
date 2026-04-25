import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import { useDexContext } from '@/context/DexContext';
import { TOKENS, NATIVE_TOKEN, CHAIN_CONFIG, getTokenBySymbol, isNativeToken } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';
import { useWolfVoice, guessLanguage } from '@/hooks/useWolfVoice';
import { WolfSpinner } from './ui/WolfSkeleton';

type Role = 'user' | 'assistant' | 'tool' | 'system';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** UI-only: a structured action proposal awaiting user confirmation. */
  proposal?: ActionProposal;
  /** UI-only: a multi-step autotrade plan awaiting user confirmation. */
  plan?: TradePlan;
  /** UI-only: a tool result card to display nicely. */
  card?: ResultCard;
}

interface ActionProposal {
  kind: 'swap' | 'send' | 'stake' | 'unstake' | 'harvest' | 'add_liquidity' | 'remove_liquidity';
  fromToken?: string;
  toToken?: string;
  amount?: string;
  /** Only for add_liquidity = amount of tokenB */
  amountB?: string;
  /** Only for remove_liquidity (1-100) */
  percent?: number;
  recipient?: string;
  poolId?: number;
  summary: string;
}

type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface PlanStep extends ActionProposal {
  status: StepStatus;
  hash?: string;
  error?: string;
  /** Output from the previous step that this step's amount can be derived from (e.g. "swap.amountOut") */
  useOutputFromPrev?: boolean;
}

interface TradePlan {
  title: string;
  rationale: string;
  steps: PlanStep[];
  /** Has the user already started executing? */
  executing?: boolean;
  /** Index currently running, or -1 */
  currentStep?: number;
  /** True after all steps finished (success or with failures) */
  done?: boolean;
  /** True if user aborted */
  aborted?: boolean;
}

interface ResultCard {
  title: string;
  rows: Array<{ label: string; value: string; accent?: boolean }>;
}

const SUGGESTIONS_NORMAL = [
  '💰 Check all my balances',
  '🚀 Swap 1 zkLTC to WDEX',
  '🌾 Show me all farms',
  '📊 What\'s the best route for ETH→WDEX?',
  '🪙 Harvest my farm rewards',
];

const SUGGESTIONS_AUTOTRADE = [
  '🎯 Plan: rebalance 50% of my zkLTC into WDEX + ETH',
  '🌾 Plan: swap zkLTC→WDEX then stake into best farm',
  '🪙 Plan: harvest all farms then compound into WDEX',
  '⚡ Plan: split 1 zkLTC equally across BNB, MON, HYPE',
];

export default function AIAgentPanel() {
  const { wallet, dex, farming, showAgent, setShowAgent, txHistory } = useDexContext();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '🐺 **WOLF AI online.** I\'m your autonomous trading copilot on WolfDex. Ask me to check balances, fetch quotes, swap, send, stake, or harvest farms — I\'ll handle the on-chain plumbing. What\'s the play?',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [autotrade, setAutotrade] = useState(false);
  const [userLang, setUserLang] = useState<string>('en-US');
  const voice = useWolfVoice();
  const lastSpokenRef = useRef<string>('');
  const abortRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-speak the latest assistant text reply when voice output is enabled.
  useEffect(() => {
    if (!voice.voiceOutput) return;
    const last = [...messages].reverse().find(m => m.role === 'assistant' && m.content && !m.proposal && !m.plan);
    if (!last || !last.content || last.content === lastSpokenRef.current) return;
    lastSpokenRef.current = last.content;
    voice.speak(last.content, userLang);
  }, [messages, voice, userLang]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  // ===== TOOL EXECUTORS =====
  const execGetBalance = async (token: string): Promise<string> => {
    if (!wallet.address || !wallet.signer) return JSON.stringify({ error: 'wallet not connected' });
    const tok = getTokenBySymbol(token) ?? (token.toLowerCase() === 'native' ? NATIVE_TOKEN : null);
    if (!tok) return JSON.stringify({ error: `token ${token} not supported` });
    try {
      let bal: ethers.BigNumber;
      if (isNativeToken(tok.address)) {
        bal = await wallet.signer.provider!.getBalance(wallet.address);
      } else {
        const erc = new ethers.Contract(tok.address, ERC20_ABI, wallet.signer);
        bal = await erc.balanceOf(wallet.address);
      }
      return JSON.stringify({ token: tok.symbol, balance: ethers.utils.formatUnits(bal, tok.decimals) });
    } catch (e: any) { return JSON.stringify({ error: e.message }); }
  };

  const execGetQuote = async (fromSym: string, toSym: string, amount: string): Promise<string> => {
    const from = getTokenBySymbol(fromSym);
    const to = getTokenBySymbol(toSym);
    if (!from || !to) return JSON.stringify({ error: 'unknown token' });
    try {
      const quote = await dex.getBestRoute(from, to, amount);
      if (!quote) return JSON.stringify({ error: 'no route / no liquidity' });
      return JSON.stringify({
        from: from.symbol, to: to.symbol, amountIn: amount,
        amountOut: quote.amountOut, hops: quote.hops, via: quote.via,
      });
    } catch (e: any) { return JSON.stringify({ error: e.message }); }
  };

  const execListFarms = async (): Promise<string> => {
    return JSON.stringify({
      pools: farming.pools.map(p => ({
        pid: p.pid, stake: p.stakingSymbol, reward: p.rewardSymbol,
        apr: p.apr.toFixed(2), totalStaked: p.totalStaked,
        rewardPerDay: p.rewardPerDay.toFixed(4),
      })),
    });
  };

  const execListBalances = async (): Promise<string> => {
    if (!wallet.address) return JSON.stringify({ error: 'wallet not connected' });
    try {
      const addrs = TOKENS.map(t => t.address);
      const bals = await dex.getMultipleBalances(addrs);
      return JSON.stringify({
        wallet: wallet.address,
        balances: TOKENS.map((t, i) => ({
          symbol: t.symbol, balance: bals[i] || '0',
        })).filter(b => parseFloat(b.balance) > 0),
      });
    } catch (e: any) { return JSON.stringify({ error: e.message }); }
  };

  const execListPools = async (): Promise<string> => {
    try {
      const pairs = await dex.getAllPairs();
      const rows = (pairs || []).slice(0, 25).map((p: any) => ({
        pair: `${p.token0Symbol ?? p.symbol0 ?? '?'}-${p.token1Symbol ?? p.symbol1 ?? '?'}`,
        address: p.address ?? p.pairAddress,
        reserve0: p.reserve0,
        reserve1: p.reserve1,
      }));
      return JSON.stringify({ count: rows.length, pools: rows });
    } catch (e: any) { return JSON.stringify({ error: e.message }); }
  };

  const execGetLpPosition = async (tokenASym: string, tokenBSym: string): Promise<string> => {
    if (!wallet.address || !wallet.signer) return JSON.stringify({ error: 'wallet not connected' });
    const tokenA = getTokenBySymbol(tokenASym);
    const tokenB = getTokenBySymbol(tokenBSym);
    if (!tokenA || !tokenB) return JSON.stringify({ error: 'unknown token symbol' });
    try {
      const pairAddress = await dex.getPairAddress(tokenA.address, tokenB.address);
      if (!pairAddress || /^0x0+$/.test(pairAddress)) {
        return JSON.stringify({ pairExists: false, tokenA: tokenA.symbol, tokenB: tokenB.symbol, message: 'Pool does not exist yet — add_liquidity will create it.' });
      }
      const info: any = await dex.getPairInfo(pairAddress);
      const erc = new ethers.Contract(pairAddress, ERC20_ABI, wallet.signer);
      const [lpBal, totalSupply] = await Promise.all([
        erc.balanceOf(wallet.address),
        erc.totalSupply(),
      ]);
      const lpBalStr = ethers.utils.formatEther(lpBal);
      const totalStr = ethers.utils.formatEther(totalSupply);
      const sharePct = totalSupply.isZero() ? 0 : (parseFloat(lpBalStr) / parseFloat(totalStr)) * 100;
      // Derive underlying amounts the user would receive
      const r0 = info?.reserve0 ? parseFloat(info.reserve0) : 0;
      const r1 = info?.reserve1 ? parseFloat(info.reserve1) : 0;
      const underlyingA = (sharePct / 100) * r0;
      const underlyingB = (sharePct / 100) * r1;
      return JSON.stringify({
        pairExists: true,
        pairAddress,
        tokenA: tokenA.symbol,
        tokenB: tokenB.symbol,
        lpBalance: lpBalStr,
        sharePct: sharePct.toFixed(4),
        underlyingA: underlyingA.toFixed(6),
        underlyingB: underlyingB.toFixed(6),
        ratio: r0 > 0 ? (r1 / r0).toFixed(8) : null,
      });
    } catch (e: any) { return JSON.stringify({ error: e.message }); }
  };

  // Run conversation turn (one round-trip; auto-loops if model returns tool calls)
  const sendTurn = useCallback(async (newMessages: ChatMessage[]) => {
    setBusy(true); setThinking(true);
    try {
      // Trim to API-shape (drop UI-only fields)
      const apiMessages = newMessages.map(({ role, content, tool_calls, tool_call_id }) => {
        const m: any = { role, content: content || '' };
        if (tool_calls) m.tool_calls = tool_calls;
        if (tool_call_id) m.tool_call_id = tool_call_id;
        return m;
      });

      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          mode: autotrade ? 'autotrade' : 'normal',
          voiceMode: voice.voiceOutput,
          languageHint: userLang,
          context: {
            address: wallet.address,
            chainId: wallet.chainId,
            balance: wallet.balance,
            farmCount: farming.pools.length,
            farms: farming.pools.map(p => ({
              pid: p.pid, stake: p.stakingSymbol, reward: p.rewardSymbol, apr: p.apr,
            })),
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'request failed' }));
        setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${err.error ?? 'AI error'}` }]);
        return;
      }
      const data = await res.json();
      const toolCalls: ToolCall[] = data.tool_calls ?? [];

      if (toolCalls.length === 0) {
        setMessages(m => [...m, { role: 'assistant', content: data.content || '...' }]);
        return;
      }

      // Append assistant turn with the tool_calls (required by chat protocol)
      const withAssistant: ChatMessage[] = [...newMessages, { role: 'assistant', content: data.content || '', tool_calls: toolCalls }];

      // Execute each tool call
      const toolResultMessages: ChatMessage[] = [];
      const proposalMessages: ChatMessage[] = [];

      for (const tc of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { }

        if (tc.function.name === 'propose_action') {
          const proposal: ActionProposal = {
            kind: args.kind, fromToken: args.fromToken, toToken: args.toToken,
            amount: args.amount, amountB: args.amountB, percent: args.percent,
            recipient: args.recipient, poolId: args.poolId,
            summary: args.summary || 'Proposed action',
          };
          // Tool result: tell the model proposal was surfaced
          toolResultMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ status: 'awaiting_user_confirmation', proposal }),
          });
          // Show a confirmation card to the user
          proposalMessages.push({ role: 'assistant', content: '', proposal });
          continue;
        }

        if (tc.function.name === 'propose_plan') {
          const rawSteps: any[] = Array.isArray(args.steps) ? args.steps : [];
          const steps: PlanStep[] = rawSteps.map((s: any) => ({
            kind: s.kind,
            fromToken: s.fromToken, toToken: s.toToken,
            amount: s.amount, amountB: s.amountB, percent: s.percent,
            recipient: s.recipient, poolId: s.poolId,
            summary: s.summary || `${s.kind}`,
            useOutputFromPrev: !!s.useOutputFromPrev,
            status: 'pending' as StepStatus,
          })).filter(s => !!s.kind);
          const plan: TradePlan = {
            title: args.title || '🎯 Autotrade Plan',
            rationale: args.rationale || '',
            steps,
            executing: false, currentStep: -1, done: false, aborted: false,
          };
          toolResultMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ status: 'awaiting_user_confirmation', stepCount: steps.length }),
          });
          proposalMessages.push({ role: 'assistant', content: '', plan });
          continue;
        }

        let result = '';
        if (tc.function.name === 'get_balance') result = await execGetBalance(args.token);
        else if (tc.function.name === 'list_balances') result = await execListBalances();
        else if (tc.function.name === 'get_quote') result = await execGetQuote(args.fromToken, args.toToken, args.amount);
        else if (tc.function.name === 'list_farms') result = await execListFarms();
        else if (tc.function.name === 'list_pools') result = await execListPools();
        else if (tc.function.name === 'get_lp_position') result = await execGetLpPosition(args.tokenA, args.tokenB);
        else result = JSON.stringify({ error: `unknown tool ${tc.function.name}` });

        toolResultMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      const next = [...withAssistant, ...toolResultMessages];
      // Surface proposals immediately to user
      if (proposalMessages.length > 0) {
        setMessages([...next, ...proposalMessages]);
        return; // pause — wait for user confirmation
      }
      // Otherwise, ask the model to summarize/respond using the tool results
      await sendTurn(next);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message ?? 'request failed'}` }]);
    } finally {
      setBusy(false); setThinking(false);
    }
  }, [wallet.address, wallet.chainId, wallet.balance, farming.pools, dex, autotrade]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    await sendTurn(next);
  };

  // ===== STEP EXECUTOR (shared by single proposal + plan) =====
  /**
   * Executes one action (swap/send/stake/unstake/harvest) on-chain.
   * Returns { hash, card, output } where `output` is the post-step value
   * useful for chaining (e.g. swap.amountOut → next step's input amount).
   */
  const runStep = useCallback(async (p: ActionProposal, prevOutput?: string): Promise<{ hash: string; card: ResultCard; output?: string }> => {
    if (!wallet.isConnected || !wallet.signer) throw new Error('Wallet not connected');

    let hash = '';
    let card: ResultCard;
    let output: string | undefined;

    if (p.kind === 'swap') {
      const from = getTokenBySymbol(p.fromToken!); const to = getTokenBySymbol(p.toToken!);
      if (!from || !to) throw new Error('invalid swap params');
      // Allow chaining: if amount is missing/zero and prev step produced output, use that
      const amt = p.amount && parseFloat(p.amount) > 0 ? p.amount : (prevOutput ?? '');
      if (!amt || parseFloat(amt) <= 0) throw new Error('invalid amount');
      const route = await dex.getBestRoute(from, to, amt);
      if (!route) throw new Error('no route / liquidity');
      hash = await dex.swap(from, to, amt, route.amountOut, undefined, undefined, route.path);
      output = route.amountOut;
      card = {
        title: '✅ Swap executed',
        rows: [
          { label: 'From', value: `${amt} ${from.symbol}` },
          { label: 'To', value: `${parseFloat(route.amountOut).toFixed(6)} ${to.symbol}`, accent: true },
          { label: 'Route', value: `${route.via} (${route.hops} hop${route.hops > 1 ? 's' : ''})` },
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else if (p.kind === 'send') {
      const tok = getTokenBySymbol(p.fromToken!);
      const amt = p.amount && parseFloat(p.amount) > 0 ? p.amount : (prevOutput ?? '');
      if (!tok || !amt || !p.recipient) throw new Error('invalid send params');
      const parsed = ethers.utils.parseUnits(amt, tok.decimals);
      let tx: ethers.providers.TransactionResponse;
      if (isNativeToken(tok.address)) {
        tx = await wallet.signer.sendTransaction({ to: p.recipient, value: parsed });
      } else {
        const erc = new ethers.Contract(tok.address, ERC20_ABI, wallet.signer);
        tx = await erc.transfer(p.recipient, parsed);
      }
      await tx.wait(); hash = tx.hash; output = amt;
      card = {
        title: '✅ Sent',
        rows: [
          { label: 'Amount', value: `${amt} ${tok.symbol}`, accent: true },
          { label: 'To', value: `${p.recipient.slice(0, 8)}…${p.recipient.slice(-6)}` },
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else if (p.kind === 'stake' || p.kind === 'unstake') {
      const pool = farming.pools.find(x => x.pid === p.poolId);
      const amt = p.amount && parseFloat(p.amount) > 0 ? p.amount : (prevOutput ?? '');
      if (!pool || !amt) throw new Error('invalid pool / amount');
      if (p.kind === 'stake') {
        const u = farming.userInfos[pool.pid];
        const need = ethers.utils.parseUnits(amt, pool.stakingDecimals);
        if (ethers.BigNumber.from(u?.allowance ?? '0').lt(need)) {
          await farming.approve(pool);
        }
        hash = await farming.deposit(pool, amt);
      } else {
        hash = await farming.withdraw(pool, amt);
      }
      output = amt;
      card = {
        title: p.kind === 'stake' ? '✅ Staked' : '✅ Unstaked',
        rows: [
          { label: 'Pool', value: `#${pool.pid} ${pool.stakingSymbol}` },
          { label: 'Amount', value: `${amt} ${pool.stakingSymbol}`, accent: true },
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else if (p.kind === 'harvest') {
      const pool = farming.pools.find(x => x.pid === p.poolId);
      if (!pool) throw new Error('invalid pool');
      const u = farming.userInfos[pool.pid];
      const pending = parseFloat(u?.pending ?? '0');
      hash = await farming.harvest(pool);
      output = pending.toString();
      card = {
        title: '✅ Harvested',
        rows: [
          { label: 'Pool', value: `#${pool.pid}` },
          { label: 'Reward', value: `${pending.toFixed(6)} ${pool.rewardSymbol}`, accent: true },
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else if (p.kind === 'add_liquidity') {
      const tokenA = getTokenBySymbol(p.fromToken!);
      const tokenB = getTokenBySymbol(p.toToken!);
      if (!tokenA || !tokenB) throw new Error('invalid token pair');
      const amtA = p.amount && parseFloat(p.amount) > 0 ? p.amount : '';
      const amtB = p.amountB && parseFloat(p.amountB) > 0 ? p.amountB : '';
      if (!amtA || !amtB) throw new Error('add_liquidity needs both amounts');
      hash = await dex.addLiquidity(tokenA, tokenB, amtA, amtB);
      output = amtA;
      card = {
        title: '✅ Liquidity Added',
        rows: [
          { label: 'Pair', value: `${tokenA.symbol} / ${tokenB.symbol}` },
          { label: tokenA.symbol, value: amtA, accent: true },
          { label: tokenB.symbol, value: amtB, accent: true },
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else if (p.kind === 'remove_liquidity') {
      const tokenA = getTokenBySymbol(p.fromToken!);
      const tokenB = getTokenBySymbol(p.toToken!);
      if (!tokenA || !tokenB) throw new Error('invalid token pair');
      const pairAddress = await dex.getPairAddress(tokenA.address, tokenB.address);
      if (!pairAddress || /^0x0+$/.test(pairAddress)) throw new Error('pool does not exist');
      // Resolve LP amount: explicit `amount`, or `percent` of current LP balance
      let lpAmount = p.amount && parseFloat(p.amount) > 0 ? p.amount : '';
      if (!lpAmount && p.percent && p.percent > 0 && p.percent <= 100) {
        const erc = new ethers.Contract(pairAddress, ERC20_ABI, wallet.signer);
        const bal: ethers.BigNumber = await erc.balanceOf(wallet.address);
        const portion = bal.mul(Math.round(p.percent * 100)).div(10000);
        lpAmount = ethers.utils.formatEther(portion);
      }
      if (!lpAmount || parseFloat(lpAmount) <= 0) throw new Error('invalid LP amount or percent');
      hash = await dex.removeLiquidity(tokenA, tokenB, lpAmount, pairAddress);
      output = lpAmount;
      card = {
        title: '✅ Liquidity Removed',
        rows: [
          { label: 'Pair', value: `${tokenA.symbol} / ${tokenB.symbol}` },
          { label: 'LP burned', value: parseFloat(lpAmount).toFixed(6), accent: true },
          ...(p.percent ? [{ label: 'Portion', value: `${p.percent}%` }] : []),
          { label: 'TX', value: `${hash.slice(0, 10)}…${hash.slice(-8)}` },
        ],
      };
    } else {
      throw new Error(`unknown action kind: ${(p as any).kind}`);
    }

    return { hash, card, output };
  }, [wallet, dex, farming]);

  // ===== EXECUTE PROPOSED ACTION (single) =====
  const executeProposal = async (idx: number, p: ActionProposal) => {
    if (!wallet.isConnected || !wallet.signer) { toast.error('Connect wallet'); return; }
    setBusy(true);
    const pendingId = `pending-agent-${Date.now()}`;
    const label = p.kind.replace(/_/g, ' ').toUpperCase();
    txHistory.add({
      hash: pendingId, kind: 'agent', status: 'pending',
      summary: `🤖 ${p.summary}`, account: wallet.address || '', chainId: CHAIN_CONFIG.chainId,
    });
    const t = toast.loading(`🤖 Executing: ${p.summary}`);
    try {
      const { hash, card } = await runStep(p);
      txHistory.update(pendingId, { hash, status: 'success' });
      toast.success(`${label} success`, {
        id: t,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
      setMessages(m => m.map((msg, i) => i === idx ? { role: 'assistant', content: '', card } : msg));
    } catch (e: any) {
      txHistory.update(pendingId, { status: 'failed' });
      toast.error(`${label} failed`, { id: t, description: (e.reason || e.message || '').slice(0, 120) });
      setMessages(m => m.map((msg, i) => i === idx ? { role: 'assistant', content: `❌ Action failed: ${e.message ?? 'unknown error'}`, proposal: undefined } : msg));
    } finally { setBusy(false); }
  };

  const cancelProposal = (idx: number) => {
    setMessages(m => m.map((msg, i) => i === idx ? { role: 'assistant', content: '🚫 Action cancelled.', proposal: undefined } : msg));
  };

  // ===== EXECUTE AUTOTRADE PLAN (multi-step, sequential, abortable) =====
  const updatePlan = (idx: number, patch: (plan: TradePlan) => TradePlan) => {
    setMessages(m => m.map((msg, i) => {
      if (i !== idx || !msg.plan) return msg;
      return { ...msg, plan: patch(msg.plan) };
    }));
  };

  const executePlan = async (idx: number, plan: TradePlan) => {
    if (!wallet.isConnected || !wallet.signer) { toast.error('Connect wallet'); return; }
    if (plan.executing || plan.done) return;
    abortRef.current = false;
    setBusy(true);
    updatePlan(idx, p => ({ ...p, executing: true, currentStep: 0, aborted: false }));
    const tPlan = toast.loading(`🎯 Autotrade: ${plan.title}`);

    let prevOutput: string | undefined;
    let okCount = 0, failCount = 0;

    for (let i = 0; i < plan.steps.length; i++) {
      if (abortRef.current) {
        updatePlan(idx, p => ({
          ...p,
          steps: p.steps.map((s, j) => j >= i && s.status === 'pending' ? { ...s, status: 'skipped' } : s),
          aborted: true, done: true, executing: false, currentStep: -1,
        }));
        break;
      }
      updatePlan(idx, p => ({
        ...p, currentStep: i,
        steps: p.steps.map((s, j) => j === i ? { ...s, status: 'running' } : s),
      }));
      const step = plan.steps[i];
      const pendingId = `pending-plan-${Date.now()}-${i}`;
      txHistory.add({
        hash: pendingId, kind: 'agent', status: 'pending',
        summary: `🎯 [${i + 1}/${plan.steps.length}] ${step.summary}`,
        account: wallet.address || '', chainId: CHAIN_CONFIG.chainId,
      });
      try {
        const useChain = step.useOutputFromPrev && prevOutput;
        const { hash, output } = await runStep(step, useChain ? prevOutput : undefined);
        prevOutput = output;
        txHistory.update(pendingId, { hash, status: 'success' });
        updatePlan(idx, p => ({
          ...p,
          steps: p.steps.map((s, j) => j === i ? { ...s, status: 'done', hash } : s),
        }));
        okCount++;
      } catch (e: any) {
        const msg = (e.reason || e.message || 'failed').slice(0, 200);
        txHistory.update(pendingId, { status: 'failed' });
        updatePlan(idx, p => ({
          ...p,
          steps: p.steps.map((s, j) => j === i ? { ...s, status: 'failed', error: msg } : s),
        }));
        failCount++;
        // Stop on first failure to avoid cascading damage
        toast.error(`Step ${i + 1} failed`, { description: msg });
        updatePlan(idx, p => ({
          ...p,
          steps: p.steps.map((s, j) => j > i && s.status === 'pending' ? { ...s, status: 'skipped' } : s),
          done: true, executing: false, currentStep: -1,
        }));
        break;
      }
    }

    if (okCount === plan.steps.length) {
      updatePlan(idx, p => ({ ...p, done: true, executing: false, currentStep: -1 }));
      toast.success(`🎯 Plan complete (${okCount}/${plan.steps.length})`, { id: tPlan });
    } else if (failCount > 0) {
      toast.error(`Plan stopped at step ${okCount + 1}`, { id: tPlan, description: `${okCount} succeeded, ${failCount} failed` });
    } else {
      toast.dismiss(tPlan);
    }
    setBusy(false);
  };

  const abortPlan = (idx: number) => {
    abortRef.current = true;
    toast.message('🛑 Aborting plan after current step…');
  };

  const cancelPlan = (idx: number) => {
    setMessages(m => m.map((msg, i) => i === idx ? { role: 'assistant', content: '🚫 Plan cancelled.', plan: undefined } : msg));
  };

  return (
    <>
      {/* Floating launcher */}
      <motion.button
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        onClick={() => setShowAgent(true)}
        className={`fixed bottom-6 right-6 z-[60] w-16 h-16 rounded-full shadow-2xl ${showAgent ? 'opacity-0 pointer-events-none' : ''}`}
        style={{
          background: 'radial-gradient(circle at 30% 30%, #f0b429, #e040a0 60%, #6f1d9e)',
          boxShadow: '0 10px 40px rgba(224,64,160,0.5), 0 0 0 4px rgba(224,64,160,0.15)',
        }}
        aria-label="Open AI Trading Agent"
      >
        <span className="absolute inset-0 rounded-full bg-wolf-pink/40 animate-ping" />
        <span className="relative text-3xl">🤖</span>
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-wolf-green border-2 border-wolf-dark text-[8px] font-bold text-wolf-dark flex items-center justify-center">AI</span>
      </motion.button>

      <AnimatePresence>
        {showAgent && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-end sm:justify-end bg-black/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-0"
            onClick={() => setShowAgent(false)}
          >
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-full sm:max-w-md h-[85vh] sm:h-[90vh] sm:m-6 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(160deg, rgba(15,15,30,0.95) 0%, rgba(35,15,55,0.92) 50%, rgba(15,15,30,0.95) 100%)',
                border: '1px solid rgba(224,64,160,0.3)',
                boxShadow: '0 0 60px rgba(224,64,160,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Animated glow blobs */}
              <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full bg-wolf-pink/20 blur-3xl pointer-events-none animate-pulse" />
              <div className="absolute -bottom-32 -right-32 w-72 h-72 rounded-full bg-wolf-gold/15 blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />

              {/* Header */}
              <div className="relative px-5 py-4 border-b border-wolf-border/30 flex items-center justify-between gap-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: 'linear-gradient(135deg, #f0b429, #e040a0)' }}
                    >🐺</div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-wolf-green border-2 border-wolf-dark" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-base wolf-gradient-text truncate">WOLF AI</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" />
                      {autotrade ? 'Autotrade · Multi-step' : 'Trading Agent · Online'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Autotrade toggle */}
                  <button
                    onClick={() => setAutotrade(v => !v)}
                    title={autotrade ? 'Switch to single-action mode' : 'Switch to multi-step Autotrade mode'}
                    className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-full transition-all border ${
                      autotrade
                        ? 'bg-gradient-to-r from-wolf-pink/30 to-wolf-gold/30 border-wolf-pink/50 text-wolf-pink shadow-md shadow-wolf-pink/20'
                        : 'bg-wolf-surface/40 border-wolf-border/30 text-muted-foreground hover:text-foreground hover:border-wolf-pink/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autotrade ? 'bg-wolf-pink animate-pulse' : 'bg-muted-foreground'}`} />
                    {autotrade ? '🎯 AUTO' : 'AUTO'}
                  </button>
                  <button onClick={() => setShowAgent(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none px-2">×</button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.filter(m => m.role !== 'tool' && (m.content || m.proposal || m.plan || m.card || m.tool_calls?.length)).map((msg, i) => {
                  if (msg.proposal) {
                    return (
                      <ProposalCard
                        key={i}
                        proposal={msg.proposal}
                        busy={busy}
                        onExecute={() => executeProposal(messages.indexOf(msg), msg.proposal!)}
                        onCancel={() => cancelProposal(messages.indexOf(msg))}
                      />
                    );
                  }
                  if (msg.plan) {
                    const idx = messages.indexOf(msg);
                    return (
                      <PlanCard
                        key={i}
                        plan={msg.plan}
                        busy={busy}
                        onExecute={() => executePlan(idx, msg.plan!)}
                        onAbort={() => abortPlan(idx)}
                        onCancel={() => cancelPlan(idx)}
                      />
                    );
                  }
                  if (msg.card) {
                    return <ResultCardView key={i} card={msg.card} />;
                  }
                  if (!msg.content) return null;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-br from-wolf-pink to-wolf-gold text-white rounded-tr-sm shadow-lg shadow-wolf-pink/20'
                            : 'bg-wolf-surface/70 border border-wolf-border/30 rounded-tl-sm backdrop-blur-sm'
                        }`}
                      >
                        <SimpleMarkdown text={msg.content} />
                      </div>
                    </motion.div>
                  );
                })}
                {thinking && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="px-3.5 py-2.5 rounded-2xl bg-wolf-surface/70 border border-wolf-border/30 rounded-tl-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-wolf-pink animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-wolf-gold animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-wolf-pink animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Suggestions — context-aware */}
              {messages.length <= 1 && (
                <div className="relative px-4 pb-2 flex flex-wrap gap-1.5">
                  {(autotrade ? SUGGESTIONS_AUTOTRADE : SUGGESTIONS_NORMAL).map((s: string) => (
                    <button key={s} onClick={() => setInput(s.replace(/^[^\s]+\s/, ''))}
                      className="text-[11px] px-2.5 py-1.5 rounded-full bg-wolf-surface/60 border border-wolf-border/30 hover:border-wolf-pink/40 hover:bg-wolf-pink/10 transition-all"
                    >{s}</button>
                  ))}
                </div>
              )}
              {messages.length <= 1 && autotrade && (
                <div className="relative px-4 pb-2">
                  <div className="text-[10px] text-wolf-pink/80 bg-wolf-pink/10 border border-wolf-pink/20 rounded-lg px-3 py-2 flex items-start gap-2">
                    <span>🎯</span>
                    <span>
                      <strong>Autotrade mode:</strong> Describe a trading goal (e.g. <em>"rebalance into WDEX + ETH"</em>) and WOLF AI will draft a multi-step plan. Each on-chain step still requires your one-click confirmation.
                    </span>
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="relative px-4 py-3 border-t border-wolf-border/30" style={{ background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-wolf-surface/60 border border-wolf-border/40 focus-within:border-wolf-pink/60 transition-colors">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={!wallet.isConnected ? 'Connect wallet for trading actions' : autotrade ? 'Describe your trading goal — WOLF AI will draft a plan…' : 'Ask WOLF AI to trade…'}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                    disabled={busy}
                  />
                  <button
                    onClick={send}
                    disabled={busy || !input.trim()}
                    className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 transition-all"
                    style={{ background: 'linear-gradient(135deg, #f0b429, #e040a0)' }}
                    aria-label="Send"
                  >
                    {busy ? (
                      <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeLinecap="round"/></svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2 12L22 2L18 22L12 14L2 12Z" /></svg>
                    )}
                  </button>
                </div>
                <div className="text-[9px] text-muted-foreground/60 mt-1.5 text-center">
                  ⚠️ Testnet only — actions execute real on-chain transactions on {CHAIN_CONFIG.chainName}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ===== Sub-components =====

function ProposalCard({ proposal, busy, onExecute, onCancel }: {
  proposal: ActionProposal; busy: boolean; onExecute: () => void; onCancel: () => void;
}) {
  const KIND_ICON: Record<ActionProposal['kind'], string> = {
    swap: '🔁', send: '📤', stake: '🌾', unstake: '🪺', harvest: '🪙',
    add_liquidity: '➕💧', remove_liquidity: '➖💧',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-2xl p-4 border border-wolf-pink/40 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(224,64,160,0.12), rgba(240,180,41,0.08))' }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-wolf-pink/15 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{KIND_ICON[proposal.kind]}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-wolf-pink">
            {proposal.kind} · Awaiting confirmation
          </span>
        </div>
        <p className="text-sm font-bold mb-3 leading-snug">{proposal.summary}</p>
        <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
          {proposal.fromToken && (
            <Field
              label={
                proposal.kind === 'send' ? 'Token'
                : proposal.kind === 'add_liquidity' || proposal.kind === 'remove_liquidity' ? 'Token A'
                : 'From'
              }
              value={proposal.fromToken}
            />
          )}
          {proposal.toToken && (
            <Field
              label={
                proposal.kind === 'add_liquidity' || proposal.kind === 'remove_liquidity' ? 'Token B' : 'To'
              }
              value={proposal.toToken}
            />
          )}
          {proposal.amount && (
            <Field
              label={
                proposal.kind === 'add_liquidity' ? `Amount ${proposal.fromToken ?? 'A'}`
                : proposal.kind === 'remove_liquidity' ? 'LP Amount'
                : 'Amount'
              }
              value={proposal.amount}
              accent
            />
          )}
          {proposal.amountB && proposal.kind === 'add_liquidity' && (
            <Field label={`Amount ${proposal.toToken ?? 'B'}`} value={proposal.amountB} accent />
          )}
          {proposal.percent !== undefined && proposal.kind === 'remove_liquidity' && (
            <Field label="Portion" value={`${proposal.percent}%`} accent />
          )}
          {proposal.recipient && <Field label="Recipient" value={`${proposal.recipient.slice(0, 6)}…${proposal.recipient.slice(-4)}`} />}
          {proposal.poolId !== undefined && <Field label="Pool" value={`#${proposal.poolId}`} />}
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={onExecute}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}
          >{busy ? 'Executing…' : '✅ Execute'}</button>
          <button
            disabled={busy}
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-wolf-surface/60 border border-wolf-border/40 hover:bg-destructive/10 hover:border-destructive/40 disabled:opacity-50"
          >Cancel</button>
        </div>
      </div>
    </motion.div>
  );
}

function ResultCardView({ card }: { card: ResultCard }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-2xl p-3.5 border border-wolf-green/40 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(240,180,41,0.05))' }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-wolf-green/15 blur-2xl" />
      <div className="relative">
        <p className="text-sm font-bold mb-2">{card.title}</p>
        <div className="space-y-1 text-[11px]">
          {card.rows.map((r, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={r.accent ? 'font-bold wolf-gradient-text' : 'font-mono'}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-wolf-surface/40 rounded-lg px-2.5 py-1.5 border border-wolf-border/20">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`mt-0.5 ${accent ? 'font-bold wolf-gradient-text' : 'font-medium'}`}>{value}</div>
    </div>
  );
}

// ===== PlanCard (multi-step Autotrade) =====
function PlanCard({ plan, busy, onExecute, onAbort, onCancel }: {
  plan: TradePlan; busy: boolean;
  onExecute: () => void; onAbort: () => void; onCancel: () => void;
}) {
  const KIND_ICON: Record<ActionProposal['kind'], string> = {
    swap: '🔁', send: '📤', stake: '🌾', unstake: '🪺', harvest: '🪙',
    add_liquidity: '➕💧', remove_liquidity: '➖💧',
  };
  const STATUS_STYLE: Record<StepStatus, { dot: string; text: string; icon: string }> = {
    pending:  { dot: 'bg-muted-foreground/40',           text: 'text-muted-foreground', icon: '○' },
    running:  { dot: 'bg-wolf-pink animate-pulse',       text: 'text-wolf-pink',        icon: '◍' },
    done:     { dot: 'bg-wolf-green',                    text: 'text-wolf-green',       icon: '✓' },
    failed:   { dot: 'bg-destructive',                   text: 'text-destructive',      icon: '✕' },
    skipped:  { dot: 'bg-muted-foreground/30',           text: 'text-muted-foreground/60', icon: '–' },
  };
  const total = plan.steps.length;
  const doneCount = plan.steps.filter(s => s.status === 'done').length;
  const progress = total > 0 ? (doneCount / total) * 100 : 0;
  const canExecute = !plan.executing && !plan.done && total > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-2xl p-4 border border-wolf-pink/40 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(224,64,160,0.14), rgba(240,180,41,0.08))' }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-wolf-pink/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-wolf-gold/10 blur-2xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🎯</span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-wolf-pink">
              Autotrade Plan · {total} step{total !== 1 ? 's' : ''}
            </span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            plan.done && !plan.aborted && doneCount === total ? 'bg-wolf-green/20 text-wolf-green' :
            plan.aborted ? 'bg-destructive/20 text-destructive' :
            plan.executing ? 'bg-wolf-pink/20 text-wolf-pink' :
            'bg-wolf-surface/60 text-muted-foreground'
          }`}>
            {plan.done ? (plan.aborted ? 'ABORTED' : doneCount === total ? 'COMPLETE' : 'STOPPED') : plan.executing ? 'RUNNING' : 'PENDING'}
          </span>
        </div>
        <p className="text-sm font-bold mb-1 leading-snug">{plan.title}</p>
        {plan.rationale && <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">{plan.rationale}</p>}

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-wolf-dark/60 overflow-hidden mb-3">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #e040a0, #f0b429)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Steps */}
        <ol className="space-y-1.5 mb-3">
          {plan.steps.map((s, i) => {
            const sty = STATUS_STYLE[s.status];
            return (
              <li key={i} className={`rounded-lg px-2.5 py-2 flex items-start gap-2.5 border ${
                s.status === 'running' ? 'border-wolf-pink/40 bg-wolf-pink/5' :
                s.status === 'done' ? 'border-wolf-green/30 bg-wolf-green/5' :
                s.status === 'failed' ? 'border-destructive/40 bg-destructive/5' :
                'border-wolf-border/20 bg-wolf-surface/30'
              }`}>
                <div className="flex flex-col items-center pt-0.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${sty.dot} text-wolf-dark`}>
                    {s.status === 'done' || s.status === 'failed' || s.status === 'skipped' ? sty.icon : i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base leading-none">{KIND_ICON[s.kind]}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">{s.kind}</span>
                    {s.useOutputFromPrev && <span className="text-[9px] px-1.5 py-0.5 rounded bg-wolf-gold/15 text-wolf-gold border border-wolf-gold/30">↪ chained</span>}
                    <span className={`text-[9px] uppercase font-bold ml-auto ${sty.text}`}>{s.status}</span>
                  </div>
                  <p className="text-[11px] mt-0.5 leading-snug">{s.summary}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                    {s.fromToken && <span>from <strong className="text-foreground">{s.fromToken}</strong></span>}
                    {s.toToken && <span>→ <strong className="text-foreground">{s.toToken}</strong></span>}
                    {s.amount && <span>amt <strong className="text-foreground">{s.amount}</strong></span>}
                    {s.recipient && <span>to <strong className="text-foreground font-mono">{s.recipient.slice(0, 6)}…{s.recipient.slice(-4)}</strong></span>}
                    {s.poolId !== undefined && <span>pool <strong className="text-foreground">#{s.poolId}</strong></span>}
                  </div>
                  {s.hash && (
                    <a
                      href={`${CHAIN_CONFIG.blockExplorer}/tx/${s.hash}`} target="_blank" rel="noreferrer"
                      className="inline-block text-[10px] font-mono text-wolf-pink hover:underline mt-1"
                    >🔗 {s.hash.slice(0, 10)}…{s.hash.slice(-8)}</a>
                  )}
                  {s.error && <p className="text-[10px] text-destructive mt-1 break-words">⚠️ {s.error}</p>}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Actions */}
        {!plan.done ? (
          plan.executing ? (
            <div className="flex gap-2">
              <button
                disabled={true}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white/90 cursor-wait"
                style={{ background: 'linear-gradient(135deg, #e040a0, #f0b429)' }}
              >⏳ Step {(plan.currentStep ?? 0) + 1}/{total} running…</button>
              <button
                onClick={onAbort}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-destructive/15 border border-destructive/40 text-destructive hover:bg-destructive/25"
              >🛑 Abort</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                disabled={busy || !canExecute}
                onClick={onExecute}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 shadow-lg shadow-wolf-green/20"
                style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}
              >🚀 Execute Plan ({total} step{total !== 1 ? 's' : ''})</button>
              <button
                disabled={busy}
                onClick={onCancel}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-wolf-surface/60 border border-wolf-border/40 hover:bg-destructive/10 hover:border-destructive/40 disabled:opacity-50"
              >Cancel</button>
            </div>
          )
        ) : (
          <div className="text-center text-[11px] text-muted-foreground">
            {plan.aborted ? '🛑 Plan aborted by user.' : doneCount === total ? '🎉 All steps completed successfully.' : `⛔ Plan stopped after ${doneCount}/${total} step${doneCount !== 1 ? 's' : ''}.`}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Tiny Markdown renderer: bold (**x**), italics (*x*), inline code (`x`), and line breaks. Safe for short LLM replies. */
function SimpleMarkdown({ text }: { text: string }) {
  const parts: Array<{ kind: 'text' | 'b' | 'i' | 'code'; value: string }> = [];
  // Greedy match in priority: code > bold > italic
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    if (m[1]) parts.push({ kind: 'code', value: m[1].slice(1, -1) });
    else if (m[2]) parts.push({ kind: 'b', value: m[2].slice(2, -2) });
    else if (m[3]) parts.push({ kind: 'i', value: m[3].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'b') return <strong key={i}>{p.value}</strong>;
        if (p.kind === 'i') return <em key={i}>{p.value}</em>;
        if (p.kind === 'code') return <code key={i} className="px-1 py-0.5 rounded bg-black/30 text-wolf-gold text-[11px] font-mono">{p.value}</code>;
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}

// silence unused TOKENS warning (re-export-style)
export const _AGENT_TOKEN_LIST = TOKENS;

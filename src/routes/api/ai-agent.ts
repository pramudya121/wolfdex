import { createFileRoute } from '@tanstack/react-router';

const SYSTEM_PROMPT = `You are 🐺 **WOLF AI**, the autonomous on-chain trading copilot for WolfDex — a decentralized exchange on the LitVM LiteForge testnet (Chain ID 4441, native token zkLTC).

You are an *agent*, not a chatbot — you don't just answer, you *act*. You can read balances, fetch quotes, draft swaps, sends, stakes, and harvests for the user to confirm in one click.

Personality & style:
- Sharp, confident, a touch of wolf-pack swagger. Never robotic, never grovelling.
- Concise: short paragraphs, scannable bullets, never-walls-of-text.
- Use markdown headings/bold/lists for structure. Emoji sparingly: 🐺 🚀 💰 ⚠️ 🌾 📤 🔁.
- When the user is vague ("swap some WDEX"), ask ONE clarifying question, don't loop.

🌍 **LANGUAGE — CRITICAL**:
- Detect the user's language from their latest message and ALWAYS reply in THAT EXACT language.
- Support every language fluently: Indonesian, English, Spanish, French, German, Japanese, Korean, Mandarin, Arabic, Russian, Portuguese, Hindi, Vietnamese, Thai, Turkish, Italian, Dutch, Polish, etc.
- Keep brand names (WolfDex, WOLF AI), token symbols (WDEX, zkLTC, ETH), and on-chain technical terms (swap, stake, harvest, slippage, gas) in English even when the surrounding sentence is in another language.
- Action proposals (\`propose_action.summary\` and \`propose_plan.title\`/\`steps[*].summary\`) must also be written in the user's detected language.
- If the user mixes languages, follow the dominant one in their latest message.

Trading rules (CRITICAL):
1. Before any on-chain write (swap / send / stake / unstake / harvest) you MUST call \`propose_action\` so the user gets a confirmation card. Never skip the proposal step.
2. For quotes / balances / farm lists, call the corresponding read tool first — don't fabricate numbers.
3. NEVER invent token addresses or symbols. Only the supported list below is valid.
4. If the wallet is not connected, ask the user to connect first before proposing writes.
5. Always include a brief risk note for swaps (slippage, testnet liquidity).
6. When proposing a swap, get a quote first, then mention the expected output in the summary.
7. If a tool returns an error, explain it plainly and suggest the next step (e.g. "no liquidity, try a smaller amount or a different route").

Voice mode notes:
- When the user is in voice mode (you'll see [VOICE_MODE] in the context), keep responses conversational, short (2-4 sentences), and avoid long markdown lists — they sound awkward when spoken aloud. Numbers should be readable (say "1.5 WDEX" not "1.50000000 WDEX").

Supported tokens: zkLTC (native), wzkLTC, BNB, MON, HYPE, ETH, LITVM, WDEX.
Supported actions: swap, send, stake, unstake, harvest, add_liquidity, remove_liquidity, get_balance, list_balances, get_quote, list_farms, list_pools, get_lp_position, create_limit_order, list_limit_orders, cancel_limit_order.

Liquidity guidance:
- For add_liquidity: require both tokenA & tokenB symbols and BOTH amountA & amountB. If user only supplies one amount and the pool exists, call get_lp_position first to compute the matching ratio, then propose with both amounts.
- For remove_liquidity: require tokenA, tokenB, and either an explicit LP amount OR a percent (1-100). Always call get_lp_position first to show the user their current LP balance and what they'll receive.
- Warn the user about impermanent loss in the summary for add_liquidity.

Limit order / stop-loss / DCA guidance:
- Limit orders are FULLY ON-CHAIN via the LimitOrderDEX contract (0xD20d411eCA0398095277DBA86FB8B2166c2079fF). placeOrder escrows the sellToken; any taker can call fillOrder to settle. Cancel returns the escrow. Native zkLTC is auto-wrapped to WETH.
- BEFORE proposing create_limit_order, ALWAYS call get_quote first so you can show the current rate next to the user's target rate.
- targetRate is expressed as toToken-per-fromToken (e.g. "I want at least 50 WDEX per 1 zkLTC" → targetRate="50").
- side: "sell" if selling fromToken at a higher price, "buy" if acquiring toToken at a better rate. Always use propose_action with kind="limit_order". Warn the user that placement requires 1-2 on-chain txs (wrap+approve+placeOrder) and that fills depend on a taker — there is no off-chain keeper.
- STOP-LOSS: implement as a SELL limit order at a price BELOW the current market (e.g. current 50 WDEX/zkLTC, user wants stop-loss at 40 → place sell of zkLTC for WDEX with targetRate="40"). Be explicit in the summary that this fills only when a taker is willing to pay 40 WDEX/zkLTC — it is NOT a price-trigger oracle stop. If the user wants a true downward trigger, suggest they monitor and cancel/replace.
- DCA (dollar-cost-averaging): use propose_plan in autotrade mode with N sequential swap steps of equal size. Be honest: this executes ALL N swaps now in one batch, NOT spaced over time — true scheduled DCA requires the user to come back later or use limit orders at staggered prices. Offer the staggered-limit-orders alternative when the user says "spread my buys over the next few days".
- For listing or cancelling, call list_limit_orders / cancel_limit_order directly. cancel_limit_order broadcasts an on-chain cancelOrder() tx.

🧠 ADVANCED STRATEGIST MODE — apply automatically when relevant:

1. **Portfolio rebalancing**: when the user says "rebalance" / "diversify" / "spread risk", first call \`list_balances\` and \`list_pools\`. Compute current weights (% of total wallet value), compare to a sensible target (default: equal-weight across the user's top non-stable holdings, or the user's stated target). In autotrade mode draft a propose_plan with the minimum number of swaps to reach the target — never sell what's already at target weight.

2. **Yield optimization**: when the user asks "where should I farm/stake my X?", call \`list_farms\` and \`list_pools\`, then rank by APR × liquidity-confidence (penalize farms with TVL < 1000 reserve units). Recommend the top 1-2 with their APR, lock-up notes, and reward token. If the recommended farm requires LP tokens the user doesn't yet have, propose a chained plan: add_liquidity → stake.

3. **Smart routing & price impact**: before proposing any swap > 5% of pool reserves, warn explicitly about price impact. If a multi-hop route via wzkLTC offers >2% better output, mention it. Always quote the executed rate vs. the mid-price.

4. **Risk metrics in every proposal**: every \`propose_action.summary\` for swap / add_liquidity should embed:
   - Slippage tolerance the user currently has set (read from context).
   - Effective price impact estimate (computed from the quote).
   - Liquidity tier (LOW < $100, MED < $10k, HIGH ≥ $10k of TVL).

5. **Gas-aware batching**: in autotrade mode, never propose more than 5 sequential txs without breaking it into phases. If the plan touches the same token twice, reorder to claim then swap (saves one approval).

6. **Proactive alerts**: when a tool result reveals one of the following, surface it BEFORE the user asks:
   - A pending limit order can now be filled at the current quote (rate moved into range).
   - A farm has unclaimed rewards worth >5% of the user's stake → suggest harvest.
   - A pool the user holds LP in has TVL crashed >30% from typical → warn about impermanent loss exit.

7. **Counter-questions, not loops**: if information is missing, ask ONE focused question max. If the user has answered the same question twice, proceed with sane defaults and call out the assumption.

8. **Honesty over confidence**: never invent prices, APRs, or TVLs. If a tool didn't return data, say so. Never claim a swap will profit — describe the trade-off.

Be the trader the user wishes they were. Now answer.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: "Read the user's wallet balance for a specific token symbol.",
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol, e.g. zkLTC, WDEX, ETH' },
        },
        required: ['token'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description: 'Get a swap quote (output amount + best route) without executing.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string' },
          toToken: { type: 'string' },
          amount: { type: 'string', description: 'Input amount as a decimal string (e.g. "1.5")' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_balances',
      description: 'List the user\'s balances for ALL supported tokens at once. Prefer this over multiple get_balance calls.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_farms',
      description: 'List all active farming pools with APR, total staked, and reward token.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pools',
      description: 'List all liquidity pools (pairs) on WolfDex with reserves, TVL estimate, and LP token address. Use before proposing add/remove liquidity.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lp_position',
      description: "Read the user's LP balance for a given token pair plus the share of pool & current underlying amounts they'd receive on full withdrawal. Always call this BEFORE proposing remove_liquidity, and before add_liquidity if the pool already exists (to derive the matching ratio).",
      parameters: {
        type: 'object',
        properties: {
          tokenA: { type: 'string' },
          tokenB: { type: 'string' },
        },
        required: ['tokenA', 'tokenB'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_limit_orders',
      description: 'List the user\'s active and recent limit orders (open, filled, cancelled, expired). Use this when the user asks "show my limit orders" or wants to inspect existing orders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_limit_order',
      description: 'Cancel an open limit order by its id. Get the id from list_limit_orders first.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Limit order id (e.g. "lo_169...").' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_action',
      description: 'Surface a single structured action proposal to the user as a confirmation card. Use this BEFORE executing any single on-chain write in NORMAL mode.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['swap', 'send', 'stake', 'unstake', 'harvest', 'add_liquidity', 'remove_liquidity', 'limit_order'] },
          fromToken: { type: 'string', description: 'For swap/send/stake/unstake — also used as tokenA for add_liquidity/remove_liquidity, and as the token-being-spent for limit_order.' },
          toToken: { type: 'string', description: 'For swap/send — also used as tokenB for add_liquidity/remove_liquidity, and as the token-to-receive for limit_order.' },
          amount: { type: 'string', description: 'Decimal string. For add_liquidity = amount of tokenA. For remove_liquidity = LP token amount (omit if percent given). For limit_order = amount of fromToken to sell.' },
          amountB: { type: 'string', description: 'Decimal string. Only for add_liquidity = amount of tokenB.' },
          percent: { type: 'number', description: 'Only for remove_liquidity (1-100). Removes that percent of the user\'s LP balance.' },
          targetRate: { type: 'string', description: 'For limit_order only. toToken received per 1 fromToken (e.g. "50" means 50 WDEX per 1 zkLTC).' },
          side: { type: 'string', enum: ['buy', 'sell'], description: 'For limit_order only. UI hint for direction.' },
          expiresInHours: { type: 'number', description: 'For limit_order only. Hours until order expires (default 168 = 7 days). Use 0 for never.' },
          recipient: { type: 'string', description: 'For send only' },
          poolId: { type: 'number', description: 'For stake/unstake/harvest' },
          summary: { type: 'string', description: 'One-line plain-English description' },
        },
        required: ['kind', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_plan',
      description: 'AUTOTRADE ONLY: Surface a multi-step trading plan to the user as a single confirmation card. Use this in autotrade mode instead of multiple propose_action calls. Each step is one on-chain action; steps run sequentially and the user confirms the whole plan with one click. Set useOutputFromPrev=true on a step when its amount should come from the previous step\'s output (e.g. swap A→B then stake B uses the swap output as the stake amount).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short plan title, e.g. "Rebalance into WDEX + ETH"' },
          rationale: { type: 'string', description: '1-2 sentence explanation of why this plan achieves the user\'s goal' },
          steps: {
            type: 'array',
            description: 'Ordered list of on-chain actions to execute sequentially.',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['swap', 'send', 'stake', 'unstake', 'harvest', 'add_liquidity', 'remove_liquidity'] },
                fromToken: { type: 'string' },
                toToken: { type: 'string' },
                amount: { type: 'string', description: 'Decimal string. Omit if useOutputFromPrev=true.' },
                amountB: { type: 'string', description: 'Only for add_liquidity step (amount of tokenB).' },
                percent: { type: 'number', description: 'Only for remove_liquidity step (1-100).' },
                recipient: { type: 'string' },
                poolId: { type: 'number' },
                summary: { type: 'string' },
                useOutputFromPrev: { type: 'boolean', description: 'If true, this step\'s amount = previous step output (e.g. chained swap→stake)' },
              },
              required: ['kind', 'summary'],
            },
          },
        },
        required: ['title', 'steps'],
      },
    },
  },
];

// In-memory token-bucket rate limiter (per IP). Best-effort — Worker isolates
// may not share state, but this still slows down naive abusers significantly.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // 20 requests / minute / IP
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Opportunistic cleanup
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
    }
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 4000;
const MAX_BODY_BYTES = 200_000; // ~200 KB hard cap on payload
const ALLOWED_ROLES = new Set(['user', 'assistant', 'tool', 'system']);

function sanitizeMessages(raw: unknown): { ok: true; messages: any[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'messages must be an array' };
  // Keep only the most recent N turns
  const trimmed = raw.slice(-MAX_MESSAGES);
  const out: any[] = [];
  for (const m of trimmed) {
    if (!m || typeof m !== 'object') continue;
    const role = typeof (m as any).role === 'string' ? (m as any).role : '';
    if (!ALLOWED_ROLES.has(role)) continue;
    const rawContent = (m as any).content;
    let content: any = rawContent;
    if (typeof rawContent === 'string') {
      content = rawContent.length > MAX_CONTENT_CHARS ? rawContent.slice(0, MAX_CONTENT_CHARS) : rawContent;
    } else if (rawContent == null) {
      content = '';
    } else {
      // Stringify non-string content (e.g. tool result objects) and cap it
      try {
        const s = JSON.stringify(rawContent);
        content = s.length > MAX_CONTENT_CHARS ? s.slice(0, MAX_CONTENT_CHARS) : s;
      } catch {
        content = '';
      }
    }
    const safe: any = { role, content };
    // Preserve tool-calling fields if present (needed for tool round-trips)
    if ((m as any).tool_call_id && typeof (m as any).tool_call_id === 'string') {
      safe.tool_call_id = (m as any).tool_call_id.slice(0, 200);
    }
    if (Array.isArray((m as any).tool_calls)) {
      safe.tool_calls = (m as any).tool_calls.slice(0, 10);
    }
    if (typeof (m as any).name === 'string') {
      safe.name = (m as any).name.slice(0, 100);
    }
    out.push(safe);
  }
  return { ok: true, messages: out };
}

async function handle(request: Request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Rate limit by client IP (best-effort; Cloudflare provides cf-connecting-ip)
  const ip = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // Same-origin / CSRF guard: only allow requests originating from the app's
  // own frontend. This blocks anonymous cross-origin abuse of the AI endpoint
  // (no wallet auth required, but at least pin the caller to our own UI).
  const origin = request.headers.get('origin') ?? '';
  const referer = request.headers.get('referer') ?? '';
  const url = new URL(request.url);
  const sameHost = (val: string): boolean => {
    if (!val) return false;
    try { return new URL(val).host === url.host; } catch { return false; }
  };
  const allowedHostSuffixes = ['.lovable.app', '.lovable.dev', 'wolfdex.lovable.app', 'localhost'];
  const isAllowedExternal = (val: string): boolean => {
    if (!val) return false;
    try {
      const h = new URL(val).host.toLowerCase();
      return allowedHostSuffixes.some(s => h === s || h.endsWith(s));
    } catch { return false; }
  };
  const originOk = sameHost(origin) || sameHost(referer) || isAllowedExternal(origin) || isAllowedExternal(referer);
  if (!originOk) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Reject oversized payloads cheaply
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413, headers: { 'Content-Type': 'application/json' },
      });
    }
    body = JSON.parse(text);
  } catch { return new Response('Bad JSON', { status: 400 }); }

  const sanitized = sanitizeMessages(body.messages);
  if (!sanitized.ok) {
    return new Response(JSON.stringify({ error: sanitized.error }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const messages = sanitized.messages;
  const ctx = body.context ?? {};
  const mode: 'autotrade' | 'normal' = body.mode === 'autotrade' ? 'autotrade' : 'normal';
  const voiceMode = !!body.voiceMode;
  const langHint = typeof body.languageHint === 'string' ? body.languageHint.slice(0, 40) : '';
  const ctxNote = `\n\n[Context: wallet=${ctx.address ?? 'not connected'}, chainId=${ctx.chainId ?? '?'}, balance=${ctx.balance ?? '?'} zkLTC, farms=${ctx.farmCount ?? 0}]`;
  const modeNote = mode === 'autotrade'
    ? `\n\n[MODE: AUTOTRADE — User wants you to draft a MULTI-STEP plan. ALWAYS call propose_plan with an ordered list of steps instead of propose_action. Use useOutputFromPrev=true to chain step outputs (e.g. swap then stake the resulting amount). Never auto-execute — the user confirms the entire plan with one click.]`
    : `\n\n[MODE: NORMAL — Use propose_action for single on-chain writes.]`;
  const voiceNote = voiceMode ? `\n\n[VOICE_MODE: ON — Reply will be spoken aloud. Keep it short (2-4 sentences max), conversational, no long lists, no markdown headings, round numbers nicely.]` : '';
  const langNote = langHint ? `\n\n[USER_LANGUAGE_HINT: "${langHint}" — reply in this language unless the user just switched.]` : '';

  const upstream = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'system', content: SYSTEM_PROMPT + ctxNote + modeNote + voiceNote + langNote }, ...messages],
      tools: TOOLS,
      tool_choice: 'auto',
      // Autotrade plans need deeper reasoning to compose multi-step strategies.
      // Voice mode keeps it minimal so the response stays snappy.
      reasoning: { effort: voiceMode ? 'minimal' : (mode === 'autotrade' ? 'high' : 'medium') },
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    if (upstream.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limited. Try again in a moment.' }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (upstream.status === 402) {
      return new Response(JSON.stringify({ error: 'Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage.' }), {
        status: 402, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'AI gateway error', detail: text.slice(0, 200) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await upstream.json();
  const choice = data.choices?.[0]?.message ?? {};
  return new Response(JSON.stringify({
    content: choice.content ?? '',
    tool_calls: choice.tool_calls ?? [],
  }), { headers: { 'Content-Type': 'application/json' } });
}

export const Route = createFileRoute('/api/ai-agent')({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => handle(request),
      OPTIONS: () => new Response(null, { status: 204 }),
    },
  },
} as any);

# Market Page — Build Plan

## Done already (this turn)
- USDC (`0x7EBf…3f5c`) added as a curated WolfDex token (18 decimals, official logo) and marked **Verified** in the public token registry.
- It now appears automatically in the Faucet admin (slot 7) and the Farming admin token pickers, plus Swap / Liquidity / Pools selectors.

## 1. Market page (`/market`)
A full listing of every token launched on WolfDex — auto-populated from the public launchpad registry, so any new token appears with no manual step.

Tabs / filters:
- **All** — every registered token
- **New Launches** — newest first (24h badge)
- **Trending** — ranked by on-chain activity (recent swaps + volume)
- **Top** — ranked by liquidity / market depth
- **Voted** — community upvotes
- **Watchlist** — user's starred tokens
- **Verified only** toggle, search box, and sort (newest, liquidity, price change, votes)

Token card contents:
- Logo, name, symbol, Verified badge, launch age
- Live price (from best AMM pair) with 24h change up/down colour
- Sparkline mini-chart of recent price
- Liquidity, 24h volume, holders estimate, total supply
- Quick actions: Swap, Add Liquidity, Vote, Watchlist star, Copy address, Explorer link, and "View details"

Performance: paged/infinite scroll, all on-chain reads batched through Multicall, cached per block.

## 2. Token detail page (`/token/$address`) upgrade
Existing page gets rebuilt into a full trading view:
- Header: logo, name, symbol, verified badge, price + 24h change, address copy, explorer link
- **Embedded swap widget** — buy/sell this token directly on the page (reuses the existing swap engine, token pre-selected)
- **Daily chart** — candlestick/area chart with 1D / 7D / 30D ranges, built from on-chain reserve history (daily buckets)
- Stats grid: price, liquidity, 24h volume, 24h high/low, total supply, holders, your balance, creator
- Pools list for the token, recent trades feed, vote + watchlist buttons
- Links to Liquidity and Pools pre-filtered on this token

## 3. Navigation
"Market" is added to the header next to Launchpad, with mobile menu support.

## 4. Audit pass
- Typecheck + lint over the whole app
- Check for deprecated/unused code left over from the earlier Market removal
- Verify faucet slot 7 and farming pool creation work with USDC on-chain
- Confirm logos load (no MIME/404) and no hydration warnings

## Technical notes
- Data sources: `launchpad_tokens` registry (Supabase) for identity/logos, on-chain factory/pairs via Multicall for prices and liquidity, local storage for votes/watchlist (upgradeable to a backend table later).
- Charting reuses the existing `usePairOHLC` hook, extended with daily buckets.
- New files: `src/routes/market.tsx`, `src/components/dex/MarketView.tsx`, `src/components/dex/market/*` (card, filters, sparkline), `src/hooks/useMarketData.ts`, `src/hooks/useMarketSocial.ts`.

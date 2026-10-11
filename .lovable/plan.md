# Market Page: Real Data, Realtime Charts, Professional Look

## Goal
Every price, liquidity figure, volume and chart on Market and Token Detail comes from the LitVM chain. Numbers update within seconds of a trade. No empty, `NaN`, `null` or broken values ever appear.

## 1. Real data source
- Prices come from live pool reserves, with USD values taken from the USDC pool (direct, or through WETH/WLTC when there is no direct pool).
- Liquidity is reserve × USD price. A token with no USD path shows "No USD route", not $0.
- 24h volume, number of trades and 24h change are worked out from real Swap events in a rolling 24-hour window. Rough figures such as "TVL × 0.42" are removed.
- Holders come from Transfer events, marked "approx." while indexing is still running.
- Each token gets a clear status: Live, Indexing, No liquidity, or Data unavailable.

## 2. Realtime and instant updates
- Subscribe to new blocks and Swap/Sync events on watched pools. Each event updates price, reserves and the latest chart candle at once.
- A fallback refresh every 10–15 seconds runs when the event feed drops. It retries with backoff and stays within RPC limits.
- Price changes briefly flash green or red, and numbers count smoothly to the new value. This respects reduced motion.
- A "Live" indicator shows the last update time and the block number. If updates stop for more than 60 seconds it switches to "Stale".
- Old data stays visible while a refresh is running or has failed.

## 3. Charts
- Token Detail: a professional candlestick and area chart (lightweight-charts), with 1H / 4H / 1D / 7D / 30D ranges, volume bars, crosshair tooltip and a live last candle.
- Market cards: a real sparkline built from candles, plus a placeholder when there are not enough trades.
- Candles are cached in the browser so the chart opens instantly, then filled in from the chain.

## 4. Professional layout
- Top summary bar: total market liquidity, 24h volume, 24h trades, and the number of tokens that are Live.
- Switch between a table view (sortable by price, 24h %, volume, liquidity, holders) and the current card grid.
- Tabs All / New / Trending / Top Gainers / Watchlist. Search and sort stay in the page address, so they survive a refresh and can be shared.
- A token row shows logo, name, verified badge, price, 24h %, volume, liquidity, sparkline, and quick Swap / Watch buttons.
- Token Detail: a large price header, chart, swap widget, stats grid, pools list, live trades feed with explorer links, and contract copy.
- Matching skeleton placeholders while loading, and a polished mobile layout.

## 5. Zero-null and QA
- One shared safe formatter for prices (including tiny prices like 0.0000012), percentages, compact USD and token amounts. Missing values show "—".
- Error boundary around each card and the chart, so one failure never blanks the page.
- Clear empty states: no tokens, no search results, empty watchlist, pool with no trades.
- Automated browser checks of /market and several /token pages on desktop and mobile. They scan the page text for "NaN", "null", "undefined" and "Infinity", and check the console and failed requests.

## Technical details
- New hook `useLiveMarket` runs one shared event subscription through the existing load-balanced RPC and Multicall. Components only read from it.
- Rework `useMarketData`, `usePairOHLC`, `usePairStats` and `usePairTrades` to use that shared store instead of separate polls.
- Add `lightweight-charts` and load it only in the browser, so pages rendered on the server don't break.
- Keep search state with `validateSearch` on the `/market` route. Contracts, tokens and routing are unchanged.
- Limits: LitVM testnet has little history, so the 30D ranges and holder counts may be partial at first. They are labelled as such.

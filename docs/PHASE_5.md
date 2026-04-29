# Phase 5 — Hardening, CI/CD, and Live Release

This document tracks the deliverables for Phase 5 and serves as the project's
"definition of done" for the LitVM LiteForge testnet release.

## Goals

1. **Security review** — no high/critical CVEs, documented threat model,
   pre-flight validation on every state-changing transaction.
2. **CI/CD** — every push runs lint + typecheck + build + audit + CodeQL;
   preview is auto-published from the working tree.
3. **Live release** — WOLFDEX is reachable at `https://wolfdex.lovable.app`,
   wired to the LitVM LiteForge testnet, with verified contract addresses.
4. **Documentation** — `README`, `SECURITY.md`, `RELEASE.md`, this file, and
   the in-app `/docs` page give users and contributors everything they need.

## Status

| Item | Status |
|---|---|
| Threat model documented | ✅ `SECURITY.md` |
| Pre-flight swap validation (slippage / allowance / path / deadline) | ✅ `useDex.ts → previewSwap` |
| Anonymous logos for unverified tokens | ✅ `TokenLogo.tsx` |
| Impostor pool filter | ✅ `PoolsView.tsx` |
| RPC fallback indexer (no subgraph dependency) | ✅ `usePairOHLC`, `useHistoricalAnalytics` |
| Indexer status badge (LIVE / SYNCING / OFFLINE) | ✅ `IndexerStatusBadge.tsx` |
| Cross-page command bar (⌘K) | ✅ `CommandBar.tsx` |
| Mobile / tablet / iPad navigation | ✅ `Header.tsx` (drawer + xs breakpoint) |
| Global tx notifier + history popover | ✅ `GlobalTxNotifier.tsx` |
| AI agent with tool calls + voice | ✅ `AIAgentPanel.tsx` |
| Casino + Farming + Limit Orders | ✅ |
| GitHub Actions CI (lint / typecheck / build / audit) | ✅ `.github/workflows/ci.yml` |
| CodeQL static analysis | ✅ `.github/workflows/codeql.yml` |
| Dependabot weekly | ✅ `.github/dependabot.yml` |
| Release checklist | ✅ `RELEASE.md` |
| In-app docs | ✅ `/docs` |

## Live URLs

- **App**: https://wolfdex.lovable.app
- **Explorer**: https://liteforge.explorer.caldera.xyz
- **RPC**: https://liteforge.rpc.caldera.xyz/http

## Verifying the deployment

Run these checks against the live URL after each release:

```sh
# 1. App reachable
curl -sI https://wolfdex.lovable.app | head -1
# expected: HTTP/2 200

# 2. Chain head reachable
curl -s -X POST https://liteforge.rpc.caldera.xyz/http \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'

# 3. Router code present (non-empty)
curl -s -X POST https://liteforge.rpc.caldera.xyz/http \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0xd28967D75750f477E450Df81C73f34E2713B86B4","latest"]}'
```

A non-`0x` `result` for the third call means the router is deployed at the
pinned address.

## Owner-side post-release tasks

1. Update the Lovable project's social card if branding changed.
2. Cross-post the release announcement on the LitVM Discord / Twitter.
3. Open a tracking issue for any deferred items in `Future Work` below.

## Future Work (Phase 6 candidates)

- TheGraph or Goldsky subgraph as **secondary** index (RPC stays the
  fallback, not the primary).
- Multi-chain support behind the same UI.
- Account-abstraction signed swaps (gasless trial).
- Programmable AI strategies (DCA, grid, TWAP) as background workers.
- Mobile app shell (Capacitor wrapper).

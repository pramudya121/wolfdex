# Security Policy — WOLFDEX

WOLFDEX is a non-custodial DEX frontend deployed against the LitVM LiteForge
Testnet (Chain ID **4441**). Smart contracts are external and audited
separately; this document covers the **frontend application** and the
operational surface around it.

## Reporting a Vulnerability

If you discover a security issue, please **do not open a public issue**.

- **Contact**: open a private disclosure via the Lovable project owner, or
  email `security@wolfdex.app`.
- **Scope**: frontend XSS, dependency CVEs, wallet-flow phishing surfaces,
  RPC injection, leaked secrets, supply-chain risk in `package.json`.
- **Out of scope**: third-party RPC outages, testnet faucet abuse, gas-price
  spikes, generic UX complaints.

We aim to acknowledge within 48h and ship a fix or mitigation within 7 days
for high-severity issues.

## Security Posture

### Wallet & Transactions
- All transactions are signed **client-side** by the user's wallet
  (MetaMask / OKX / Rabby / Bitget). The app never sees a private key.
- Pre-flight validation (slippage, allowance, path, deadline, balance) runs
  in `src/hooks/useDex.ts` (`previewSwap`) **before** the wallet is opened —
  so the user sees a clear go/no-go panel and an estimated gas figure.
- Transaction request details are surfaced in the UI (method, gas units,
  liquidity verification) — see `SwapCard.tsx`.

### Contract Allowlist
- Router, Factory, WETH, Casino, Farming, and LimitOrder addresses are
  **hard-coded** in `src/config/contracts.ts`. They cannot be overridden at
  runtime by URL params or imported tokens.
- A `TOKEN_BLOCKLIST` and `RESERVED_SYMBOLS` map filters known impostor
  tokens out of pool listings (see `PoolsView.tsx`).
- User-imported (custom) tokens are clearly marked with a `Custom` chip and
  rendered with an **anonymous initials avatar** — never the WDEX brand
  logo — to make brand impersonation visible.

### Data & Indexing
- The frontend does **not** depend on a third-party subgraph. All historical
  analytics and OHLC charts are built directly from on-chain events via RPC
  `eth_getLogs` (`useHistoricalAnalytics`, `usePairOHLC`). This removes a
  centralized point of failure and a censorship vector.
- A live `IndexerStatusBadge` shows data freshness and chain head lag so the
  user can see whether they're looking at stale or live data.

### Secrets
- The frontend ships **no private keys**. RPC URL and chain config are
  public. Server functions (`src/server/*.functions.ts`) read secrets from
  `process.env` inside their `.handler()` — never at module top level.

### Dependencies
- Audited via `bun audit` (run on every PR — see `.github/workflows/ci.yml`).
- Dependabot is enabled (see `.github/dependabot.yml`).
- CodeQL static analysis runs on push (see `.github/workflows/codeql.yml`).

### Headers (recommended for self-hosters)
The default Lovable host applies sensible defaults. For self-hosting,
configure your edge with at minimum:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://liteforge.rpc.caldera.xyz https://liteforge.explorer.caldera.xyz; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self';
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Threat Model Summary

| Threat | Mitigation |
|---|---|
| Impostor token in pool list | Symbol-collision detection + `TOKEN_BLOCKLIST` |
| Wallet phishing via fake logo | Anonymous avatar for unverified tokens |
| Failed/sandwiched swap | Slippage + deadline + allowance pre-flight |
| Subgraph outage | RPC event-log fallback (default) |
| RPC outage | Status badge + retry; no silent stale data |
| Supply-chain attack on deps | `bun audit`, Dependabot, CodeQL on CI |
| Leaked secret | All secrets server-only via `process.env` in handlers |

## Release Cadence

See [RELEASE.md](./RELEASE.md).

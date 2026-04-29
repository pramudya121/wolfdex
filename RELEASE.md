# Release Process — WOLFDEX

## Environments

| Env | URL | Purpose |
|---|---|---|
| **Preview** | `https://id-preview--<id>.lovable.app` | Live preview of the working tree |
| **Production** | `https://wolfdex.lovable.app` | Published build, used by end users |
| **Chain** | LitVM LiteForge Testnet — Chain ID **4441** | RPC: `https://liteforge.rpc.caldera.xyz/http` |

## Release Checklist

1. **Code freeze on the release branch** (or `main`).
2. **Run CI locally**:
   ```sh
   bun install
   bun run lint
   bunx tsc --noEmit
   bun run test          # if tests are wired
   bunx playwright test  # e2e
   ```
3. **Security pass** — see [SECURITY.md](./SECURITY.md):
   - `bun audit` (no high/critical)
   - Confirm no new top-level imports from server-only modules in client code
   - Confirm no hard-coded secrets in diff
4. **Smoke test on preview**:
   - Connect each supported wallet (MetaMask, OKX, Rabby, Bitget)
   - Swap (native ↔ ERC20, ERC20 ↔ ERC20)
   - Add + remove liquidity, create new pair
   - Open Analytics + Pools — confirm `LIVE` indexer badge
   - Open ⌘K command bar — navigate + token search
   - Submit + cancel a limit order
   - Casino: place a small bet on at least one game
5. **Publish** via the Lovable editor: top-right **Publish → Update**.
6. **Verify production**:
   - Hard refresh `https://wolfdex.lovable.app`
   - Confirm version badge / commit SHA matches the release commit
   - Re-run a 1 zkLTC swap as final smoke
7. **Tag the release** (optional, in your Git mirror): `vYYYY.MM.DD`.
8. **Announce** in #releases with: highlights, contract addresses, known issues.

## Versioning

We use **calendar versioning**: `vYYYY.MM.DD[-N]` where `-N` increments for
multiple releases on the same day. The frontend has no breaking on-chain
contract dependency — contract addresses are pinned in
`src/config/contracts.ts` and bumped explicitly.

## Rolling back

Lovable's **Publish history** retains every published build. To roll back:
1. Open the editor → Publish → History
2. Select the previous good build → **Republish**

The chain itself is unaffected — only the frontend swaps back.

## On-chain Verification

Contract addresses pinned in `src/config/contracts.ts`:

| Contract | Address |
|---|---|
| Factory | `0x5687FDA3BdE14d38057699c402606ab470EcA873` |
| Router | `0xd28967D75750f477E450Df81C73f34E2713B86B4` |
| WETH (wzkLTC) | `0x4Fd3765cde8D1d2BE4EdbaA03940AfC56794c304` |
| Library | `0x084724341e07F50782E1c3923D9a6Fb7ce993816` |
| Multicall | `0xEc94943b75359f1ede3d639AD548e56239d754c2` |
| Farming | `0x28c7167ebF6112D5B01396eEeDFe8F990Fcb54bb` |
| Casino | `0x5Be451a79E790a2D31FD5Db5C439D6E177987b2b` |
| LimitOrder | `0xD20d411eCA0398095277DBA86FB8B2166c2079fF` |

Each address can be inspected on the explorer:
`https://liteforge.explorer.caldera.xyz/address/<address>`

## Adding the Network to a Wallet

```
Network Name:   LitVM LiteForge
RPC URL:        https://liteforge.rpc.caldera.xyz/http
Chain ID:       4441
Currency:       zkLTC
Explorer:       https://liteforge.explorer.caldera.xyz
```

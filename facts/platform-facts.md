# Platform facts that shaped Kitty

Verified **2026-11-01** against `nimiq.dev` (raw markdown docs) and the live Nimiq
mainnet RPC at `rpc.nimiqwatch.com`. Probe scripts that reproduce every RPC claim
are in [`probes/`](probes/).

## What a Mini App can do (Nimiq provider, `@nimiq/mini-app-sdk` 0.2.4)

`await init()` returns a provider with exactly these methods:

| Method | Note |
|---|---|
| `listAccounts()` | user's shared addresses; one approval dialog, then cached |
| `getBalance(address)` | any address, **no approval required**; returns Luna (100,000 Luna = 1 NIM) |
| `sign(message)` | returns `{ publicKey, signature }` |
| `isConsensusEstablished()`, `getBlockNumber()` | status |
| `sendBasicTransaction({recipient, value, fee?, validityStartHeight?})` | native NIM payment |
| `sendBasicTransactionWithData({..., data})` | **`data` is capped at 64 bytes UTF-8 and is public on-chain** |
| `payLightningInvoice({invoice})` | pays a BOLT11/LNURL invoice with NIM or USDT through a self-custodial swap |
| `sendNewStakerTransaction`, `sendStakeTransaction`, `sendSetActiveStakeTransaction`, `sendUpdateStakerTransaction`, `sendRetireStakeTransaction`, `sendRemoveStakeTransaction` | the six staking operations |
| `disconnect()`, `setRPCUrl(url)`, `request(..)` | |

Host additions: `window.nimiqPay.language`, `window.nimiqPay.network`
(`mainnet`/`testnet`), `window.nimiqPay.userFiat`, a fullscreen API, and
`requestDeviceIdentifier({reason})` for a pseudonymous per-device handle.

## What it cannot do, and why that shaped the product

- **No HTLC, vesting or arbitrary contract creation.** No `createCashlink` either (that
  lives in the Nimiq Hub browser-dapp API, not the Mini App provider). So there is **no
  way to build non-custodial escrow or a locked savings vault on Nimiq.** Kitty therefore
  never takes custody of anything: contributions go directly from contributor to owner,
  and the jar is a verified public index of those payments, not a container for funds.
- **The wallet chooses the signer.** `sign()` has no address parameter and the send
  methods have no sender parameter. A Mini App cannot pay on someone's behalf. Kitty's
  design turns this into a feature: the person tapping approve is always the person paying.
- **No background or automated signing.** Every state change is a foreground native
  dialog with a 120 second deadline, and WebView cookies are wiped on each launch. So no
  subscriptions, no auto-debit, no server-initiated payments. Kitty uses no cookie-based
  session; identity is the wallet address, re-established per session.
- **Off-origin navigation kills the provider.** No OAuth, no Stripe Checkout, no external
  redirect inside the Mini App. Every flow stays on our own origin.
- **ERC-20 sends on EVM need gas** in the user's own wallet, so a USDT-only user fails at
  the last step. Nimiq basic transactions can carry a fee of zero, so NIM is the reliable
  rail and the one that earns the integration points.
- **A returned transaction hash is not a confirmation.** The docs say so explicitly.
  Kitty's backend re-reads every contribution from the chain and checks recipient, amount,
  memo, execution result and confirmations before the contribution is shown anywhere.

## Packaging and hosting

- A Mini App is a plain HTTPS web app loaded into a WebView inside Nimiq Pay. Host it
  anywhere. `https` is mandatory in store builds.
- No manifest and no domain verification: the URL is the identity.
- Deeplinks: `nimiqpay://miniapp?url=your-app.com` and
  `https://nimpay.app/miniapps/open/your-app.com` (the HTTPS form works with any domain
  and shows a warning for unlisted URLs).
- Listing in the app is a pull request to `nimiq/awesome`.
- Development: run a dev server with LAN access and type the local URL into Nimiq Pay's
  "Custom URL" field; free testnet NIM (110,000 per request) is claimable in the app after
  long-pressing the settings button for 10 seconds. **Testnet submissions do not qualify**,
  so Kitty ships on mainnet.

## Staking, and why Kitty does not stake

Unstaking NIM takes **12 hours to 4 days**, with a 100 NIM minimum to stake at all
(`nimiq.dev/nodes/validators/staking-faq`). Making that the container for a savings jar
would turn "withdraw from my jar" into a support incident, so staking is not in the MVP.

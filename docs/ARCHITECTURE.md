# Architecture and decisions

The picture is [`architecture.html`](architecture.html). This file is the reasoning behind it.

## The one constraint everything follows from

A Nimiq Mini App can send NIM, attach a 64-byte public memo, read any address's balance, and
operate the six staking transactions. It **cannot** create a contract, an HTLC or a
cashlink, and the wallet always chooses the signing account (see
[`../facts/platform-facts.md`](../facts/platform-facts.md)).

So on this platform there is exactly one way to build a shared money product without becoming
a custodian: **let the money go straight from the giver to the person it is for, and make the
bookkeeping public and verifiable.** Kitty is that bookkeeping. It is not a wallet, not an
escrow, and not a pot.

## Components

| Component | Runs on | Responsibility | Holds |
|---|---|---|---|
| `web/` Next.js app | Vercel | The Mini App inside Nimiq Pay, the public goal page, per-goal OG cards | Nothing |
| `api/` Rust service | Fly.io | Creates goals, verifies every contribution against the chain, serves the public index | No keys, no funds |
| SQLite index | Fly volume | Goals, receipts, thank-yous, reconciliation snapshots | Public data only |
| Nimiq mainnet | The chain | The money, the memos, the truth | The funds, in the owner's own wallet |

## Data flow of one contribution

1. The contributor taps chip in. The app calls
   `sendBasicTransactionWithData({ recipient: ownerAddress, value, data: "kitty:<goalId>" })`.
2. Nimiq Pay shows its native approval sheet with recipient, amount, fee and memo. The user
   approves or cancels. Kitty never sees a key.
3. The wallet returns a transaction hash. **That is not a confirmation**, and the app treats it
   as a claim, not a fact.
4. The app posts the hash to the API.
5. The API calls `getTransactionByHash` and checks, in order: recipient equals the goal owner,
   the decoded `recipientData` starts with `kitty:<goalId>`, `executionResult` is true, the
   confirmed. The **amount comes from the chain**, never from the client.
6. Only then is a receipt written and shown.

`tools/audit_chain.py` repeats steps 5 for every stored receipt on demand, and is the check run
before a demo or a submission.

## Decisions, with the tradeoff stated

**Rust for the API, as the house standard requires.** Axum, tokio, SQLx. The verifier is the
part of the system where a wrong byte costs a user's trust, so it is the part written with the
strongest types and the most tests.

**SQLite instead of Postgres.** One writer, a few thousand rows, a single Fly machine, and no
second service to fail during judging. The tradeoff is real: no horizontal writers and no
managed backups. Migrating to Postgres is a `DATABASE_URL` and a migration run, and it is the
first infrastructure change if this ever gets concurrency it cannot serve.

**An owner token instead of a signed message.** The owner's browser generates 32 random bytes
at goal creation; the server stores only its sha256. Losing the token loses the ability to post
thank-yous and close the jar, and nothing else, because nothing else is controllable. Signed
messages would be better cryptography and worse launch risk: verifying a Nimiq signature
server-side means deriving the address from the public key with blake2b and Nimiq's base32
scheme, and a subtle mismatch there locks every owner out. It is on the roadmap, behind a test
that runs against a real device signature.

**No cookies.** Nimiq Pay wipes WebView cookies between launches, so any session that depended
on them would log people out mid-flow. Identity is derived per session from
`listAccounts()`, and the only persisted value is the address plus the owner token in
`localStorage`.

**No staking in the MVP.** Unstaking takes 12 hours to 4 days with a 100 NIM minimum. Making
that the container for a savings jar would turn "take my money out" into a support incident.

## Failure behaviour, by design

| Failure | What the user sees |
|---|---|
| User cancels in the wallet (`PERMISSION_DENIED` / 4001) | The sheet returns to the form. No error, nothing recorded |
| Wallet returns a hash but the chain has not confirmed | The receipt appears marked confirming, and the amount stays pending until it confirms |
| The same payment is submitted twice | `duplicate`, and the existing receipt is what shows |
| Someone pays without the memo, or to another address | `wrong_memo` / `wrong_recipient` and nothing is recorded |
| The API is unreachable | The goal page renders a truthful "cannot read the index" screen that says the coins are safe on chain, not a 500 |
| The public RPC is briefly down | The trust line says the live balance is unavailable this second; the receipts stay |
| The owner cannot find their token | The jar keeps working for contributors. Only thank-yous and closing are lost |

## Security posture

- No secrets in the browser bundle. The RPC endpoint is public and read-only.
- The verifier never trusts a client-supplied amount, recipient or memo.
- Rate limiting and input caps: title 80, story 400, note 120, thank-you 280, amounts bounded.
- SQL access is through bound parameters only.
- The API holds no key material of any kind, so a total API compromise loses no funds. The
  worst case is falsified bookkeeping, which `tools/audit_chain.py` detects because the chain
  disagrees.

# Kitty

A goal jar your people chip into, inside Nimiq Pay.

Name what you are saving for, set the target, share the link. Everyone who cares
chips in from their own phone. Every contribution is a real NIM payment that lands
straight in the owner's own wallet and leaves a public receipt anyone can check.

Kitty never holds the money, never holds a key, and never asks for a deposit.

- Category: **Save** (Nimiq Mini Apps Competition, Cycle III)
- Platform: Nimiq Pay Mini Apps Framework, Nimiq mainnet
- Status: in build, submission due 2026-11-11 23:59 UTC

## What is real

Every claim in this README is meant to be checkable. The running log of verified
platform facts that shaped the design is in [`facts/`](facts/), including the
probe scripts that produced them and the transaction hashes they cite.

## Repository layout

```
web/     Next.js app: the Mini App, the public goal page, share cards
api/     Rust API: goal index, contribution verification against Nimiq RPC
facts/   Verified platform facts, probe scripts, chain evidence
docs/    Architecture diagram and decisions
```

## Documentation

- [`facts/platform-facts.md`](facts/platform-facts.md): what the Mini Apps Framework
  can and cannot do, with sources
- [`facts/chain-proof.md`](facts/chain-proof.md): the on-chain proof that a payment
  memo survives and can be re-read by the backend
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): components, data flow, trust boundary

Full product, demo, verification and limitation documentation lands before
submission. This file is a skeleton on day one and will be complete by 2026-11-10.

## Licence

MIT. See [LICENSE](LICENSE).

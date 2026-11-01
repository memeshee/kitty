# Kitty API contract (v1)

The single source of truth both `web/` and `api/` build against.

## Conventions

- Base URL: `https://kitty-api-memeshee.fly.dev/v1` in production, `http://localhost:8080/v1` locally.
- **Amounts are strings of integer Luna** (`1 NIM = 100,000 Luna`). Never floats, never JSON numbers. Preserve them as strings end to end.
- **Addresses are normalised** server-side to upper case with spaces stripped:
  `"NQ16 2SSN 82TL ..."` becomes `"NQ162SSN82TL..."`. Clients may send either form; responses always use the normalised form.
- Timestamps are RFC 3339 UTC strings.
- Errors are `{"error": {"code": "...", "message": "..."}}` with a stable `code`.

## The memo

A contribution is only counted if the on-chain memo decodes to a string starting with:

```
kitty:<goal_id>
```

`goal_id` is 8 characters from the alphabet `0123456789abcdefghjkmnpqrstvwxyz` (no `i`, `l`, `o`, `u`). The whole memo is 14 bytes, far inside the 64 byte cap.

## Endpoints

### `GET /health`
`200 {"ok": true, "chain_head": <number>, "network": "mainnet"}`

### `POST /goals`
Create a goal. The owner token is generated client-side (32 random bytes, hex) and is the only
credential; it is never sent to other users.

```json
{
  "owner_address": "NQ16...",
  "owner_token": "<64 hex chars>",
  "title": "Mai's school fees",
  "story": "Two terms, one jar. Anything helps. - Mai's mum",
  "target_luna": "4000000000",
  "deadline": "2026-12-20",
  "accent": "amber"
}
```
Validation: `title` 3..80 chars, `story` <= 400 chars, `target_luna` >= `100000`,  `deadline` between today and +365 days. `owner_token` must be 64 hex chars.
Response `201`: `{"goal": Goal}`

### `GET /goals/{id}`
`200 {"goal": Goal, "contributions": [Contribution], "thanks": [Thanks], "reconciliation": Reconciliation, "stats": GoalStats}`
`404` if unknown id.

### `GET /goals?owner={address}`
`200 {"goals": [Goal]}` newest first, max 50.

### `POST /goals/{id}/contributions`
Called by the contributor's client immediately after the wallet returns a transaction hash. The
server reads the chain and is the authority on every field.

```json
{ "tx_hash": "<64 hex>", "display_name": "Chi Lan", "note": "for the books" }
```
Response `201`: `{"contribution": Contribution, "goal": Goal}`
Error codes: `tx_not_found`, `wrong_recipient`, `wrong_memo`, `not_executed`, `pending`, `duplicate`, `goal_closed`.

### `POST /goals/{id}/thanks`
Header `X-Owner-Token: <64 hex>`. Body `{"body": "Thank you all, we made term one."}` (<= 280 chars).
`201 {"thanks": Thanks}` / `403 owner_token_invalid`.

### `POST /goals/{id}/close`
Header `X-Owner-Token`. `200 {"goal": Goal}` with `status: "closed"`.

### `GET /stats`
`200 {"goals": 12, "contributions": 87, "distinct_contributors": 41, "total_luna": "...", "verified_at": "..."}`
Every number here is reproducible from the chain; the endpoint exists so the product can be audited in one click.

## Objects

```json
Goal {
  "id": "k3f9x2ab",
  "owner_address": "NQ16...",
  "title": "...", "story": "...",
  "target_luna": "4000000000",
  "deadline": "2026-12-20",
  "accent": "amber",
  "status": "open",
  "created_at": "2026-11-03T09:00:00Z",
  "raised_luna": "2480000000",
  "contributors_count": 14,
  "share_url": "https://kitty.example/g/k3f9x2ab",
  "memo": "kitty:k3f9x2ab"
}

Contribution {
  "id": 12, "goal_id": "k3f9x2ab",
  "tx_hash": "e424c6...", "contributor_address": "NQ87...",
  "display_name": "Chi Lan", "note": "for the books",
  "amount_luna": "500000",
  "block_number": 65761764,
  "confirmations": 11,
  "verified_at": "2026-11-03T09:04:00Z",
  "explorer_url": "https://nimiq.watch/#e424c6..."
}

Thanks { "id": 3, "goal_id": "...", "body": "...", "created_at": "..." }

Reconciliation {
  "balance_luna": "2510000000",
  "indexed_luna": "2480000000",
  "unindexed_luna": "30000000",
  "block_number": 65761800,
  "checked_at": "...",
  "matches": true
}

GoalStats { "contributors_count": 14, "contributions_count": 22, "average_luna": "112727272", "last_contribution_at": "..." }
```

`reconciliation` is the trust feature. It reports the owner's real on-chain balance next to the
sum of indexed contributions, so anyone can see whether the jar's public ledger matches the
wallet it claims to describe. `matches` is true when `balance_luna >= indexed_luna`.

## Verification rules (server, on every contribution)

1. `getTransactionByHash`. Missing means `tx_not_found`, and the row is not stored.
2. `to` normalised must equal the goal owner's address, else `wrong_recipient`.
3. `hex::decode(recipientData)`, then UTF-8, then `starts_with("kitty:" + goal_id)`, else `wrong_memo`.
4. `executionResult` must be true, else `not_executed`.
5. `value` from the chain is the amount recorded. The client's claim is ignored entirely.
6. `tx_hash` is unique across the table, else `duplicate`.
7. If `confirmations < 1`, store as pending and report `pending`; still show the row.

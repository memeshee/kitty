# The chain proof Kitty depends on

**Question:** a Mini App records a contribution with
`sendBasicTransactionWithData({ recipient, value, data: "kitty:<goalId>" })`. Later, a
server-side verifier must re-read that transaction and confirm the recipient, the amount
and the memo. Does the memo actually survive to the chain and come back through RPC?

**Answer: yes, and the field is called `recipientData`, hex encoded.** The docs call the
outgoing parameter `data`; the chain reports it as `recipientData`, which is exactly the
kind of mismatch that silently breaks a verifier.

## Evidence

Found by scanning mainnet for any transaction carrying a memo, then reading it back by
hash. Reproduce with [`probes/spike_memo_roundtrip.py`](probes/spike_memo_roundtrip.py).

```
block         65761764          (probed at chain head 65,761,540, 2026-11-01)
hash          e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8
from          NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG
to            NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK
value         154558 Luna            (1.54558 NIM)
fee           0 Luna                (a real zero-fee transaction)
senderData    ""                    (empty)
recipientData 596f75206d696e6564204e494d206f6e204e696d69712e537061636521
              = "You mined NIM on Nimiq.Space!"  (48 bytes, inside the 64 byte cap)
executionResult true
confirmations  11
```

## What the verifier therefore does

1. `getTransactionByHash(hash)` over RPC.
2. `to` must equal the goal owner's address (normalised, spaces stripped, upper case).
3. `hex::decode(recipientData)` then UTF-8 decode, and the string must start with
   `kitty:<goalId>`.
4. `value` is taken **from the chain**, never from the client's claim.
5. `executionResult` must be true, and `confirmations` gates a pending state in the UI.
6. `hash` is unique in our database, so the same payment cannot count twice.

A mainnet transaction can therefore carry a machine-readable, publicly auditable
attribution for a payment, without a contract and without a custodian. That single fact is
what makes a non-custodial shared goal jar possible on this platform.

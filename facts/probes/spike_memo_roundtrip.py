"""D1 spike: prove that a Nimiq basic transaction's text memo is readable back from RPC.

Finding we depend on: a mini app contributes via
    sendBasicTransactionWithData({ recipient, value, data: "kitty:<goalId>" })
and our Rust backend later re-reads that transaction to verify the contribution.
If the `data` field does not survive to the chain and come back through
getTransactionByHash, the whole product concept has to be re-planned.

This script scans recent mainnet blocks for any transaction carrying `data`,
then re-reads it by hash and prints the field. No keys, no writes, read-only.
"""

import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RPC = "https://rpc.nimiqwatch.com"


def call(method, params):
    req = urllib.request.Request(
        RPC,
        data=json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode(),
        headers={"Content-Type": "application/json"},
    )
    r = json.load(urllib.request.urlopen(req, timeout=25))
    if "error" in r:
        raise RuntimeError(r["error"])
    return r["result"]["data"]


def block(h):
    try:
        return call("getBlockByNumber", [h, True])
    except Exception:
        return None


head = call("getBlockNumber", [])
print(f"head={head}")
heights = list(range(head - 400, head + 1))
with ThreadPoolExecutor(max_workers=12) as ex:
    blocks = [b for b in ex.map(block, heights) if b]

txs = [t for b in blocks for t in (b.get("transactions") or [])]
with_data = [t for t in txs if t.get("data")]
print(f"blocks={len(blocks)} txs={len(txs)} with_data={len(with_data)}")
for t in with_data[:6]:
    print("  sample data:", json.dumps(t.get("data"))[:120], "| type:", t.get("type"), "| hash:", t.get("hash")[:16])

if not with_data:
    print("NO DATA TX FOUND in sample; widen the window")
else:
    probe = with_data[0]["hash"]
    again = call("getTransactionByHash", [probe])
    print("\n--- getTransactionByHash readback ---")
    for k in ("hash", "blockNumber", "from", "to", "value", "fee", "data", "executionResult", "confirmations"):
        if k in again:
            print(f"  {k}: {json.dumps(again[k])[:130]}")
    print("\nVERDICT: data round-trips =", "data" in again and again.get("data") == with_data[0].get("data"))

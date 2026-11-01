"""Which Nimiq RPC methods exist, and with what parameters.

Read-only probe. Documents the capability surface the Kitty backend relies on.
Probed 2026-11-01 against https://rpc.nimiqwatch.com
"""

import json
import urllib.request

EP = "https://rpc.nimiqwatch.com"


def rpc(method, params=None):
    req = urllib.request.Request(
        EP,
        data=json.dumps({"jsonrpc": "2.0", "method": method, "params": params or [], "id": 1}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        r = json.load(urllib.request.urlopen(req, timeout=20))
        return "OK" if "result" in r else f"ERR {str(r.get('error'))[:80]}"
    except Exception as e:
        return f"HTTP {str(e)[:70]}"


ADDR = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000"

if __name__ == "__main__":
    for method, params in [
        ("getBlockNumber", []),
        ("getBlockByNumber", [65755244, True]),
        ("getTransactionByHash", ["0" * 64]),
        ("getAccountByAddress", [ADDR]),
        ("getStakerByAddress", [ADDR]),
        ("getEpochNumber", []),
        ("getPeerCount", []),
    ]:
        print(f"{method:24s} {rpc(method, params)}")

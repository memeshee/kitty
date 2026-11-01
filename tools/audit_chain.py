#!/usr/bin/env python3
"""Re-derive every receipt Kitty shows from the Nimiq chain.

The product's whole claim is that its receipts are not ours to invent: each one is a
payment that exists on mainnet, addressed to the goal owner, carrying the goal tag in its
memo. This script proves that claim row by row, and it is the check that runs before any
submission or demo.

    python3 tools/audit_chain.py --api https://kitty-api.example --goals k3f9x2ab,zz01ab2c

Exit code 0 means every row reproduced from the chain. 1 means at least one did not, and
the offending rows are printed. Nothing is written anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_RPC = "https://rpc.nimiqwatch.com"
DEFAULT_API = os.environ.get("KITTY_API", "http://localhost:8080")


def http_json(url: str, payload: dict | None = None, timeout: int = 25) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"content-type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


class Chain:
    def __init__(self, url: str):
        self.url = url

    def call(self, method: str, params: list) -> dict:
        body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
        r = http_json(self.url, body)
        if "error" in r:
            raise RuntimeError(f"{method}: {r['error']}")
        return r["result"]["data"]


def normalise(address: str) -> str:
    return (address or "").replace(" ", "").upper()


def decode_memo(hex_data: str) -> str:
    if not hex_data:
        return ""
    return bytes.fromhex(hex_data).decode("utf-8", errors="replace")


def audit_goal(api: str, chain: Chain, goal_id: str) -> tuple[int, int]:
    """Returns (checked, failed) for one goal."""
    detail = http_json(f"{api.rstrip('/')}/v1/goals/{goal_id}")
    goal = detail["goal"]
    owner = normalise(goal["owner_address"])
    expected_memo = f"kitty:{goal['id']}"

    checked = failed = 0
    print(f"\ngoal {goal['id']}  {goal['title']!r}")
    print(f"  owner {goal['owner_address']}")
    print(f"  receipts {len(detail['contributions'])}  raised {goal['raised_luna']} luna")

    total = 0
    for c in detail["contributions"]:
        checked += 1
        problems: list[str] = []
        try:
            tx = chain.call("getTransactionByHash", [c["tx_hash"]])
        except Exception as e:  # a receipt pointing at nothing is the worst case
            problems.append(f"not on chain ({e})")
            tx = None

        if tx is not None:
            if normalise(tx.get("to", "")) != owner:
                problems.append(f"recipient is {tx.get('to')}, not the owner")
            memo = decode_memo(tx.get("recipientData", ""))
            if not memo.startswith(expected_memo):
                problems.append(f"memo {memo!r} does not start with {expected_memo!r}")
            if tx.get("executionResult") is not True:
                problems.append("executionResult is not true")
            if int(tx.get("value", -1)) != int(c["amount_luna"]):
                problems.append(f"chain value {tx.get('value')} != recorded {c['amount_luna']}")
            if normalise(tx.get("from", "")) != normalise(c["contributor_address"]):
                problems.append(f"sender {tx.get('from')} != recorded {c['contributor_address']}")
            if c.get("block_number") and int(tx.get("blockNumber", -1)) != int(c["block_number"]):
                problems.append(f"block {tx.get('blockNumber')} != recorded {c['block_number']}")
            total += int(tx.get("value", 0))

        if problems:
            failed += 1
            print(f"  FAIL {c['tx_hash'][:16]}…  {'; '.join(problems)}")
        else:
            print(f"  ok   {c['tx_hash'][:16]}…  {c['amount_luna']} luna from {c['contributor_address'][:11]}…")

    if int(goal["raised_luna"]) != total:
        failed += 1
        print(f"  FAIL raised_luna {goal['raised_luna']} != chain sum {total}")

    rec = detail.get("reconciliation") or {}
    if rec.get("balance_luna") is not None and int(rec["balance_luna"]) < int(goal["raised_luna"]):
        failed += 1
        print(f"  WARN wallet balance {rec['balance_luna']} is below the receipts total, money may have been spent")

    return checked, failed


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify Kitty receipts against Nimiq mainnet")
    ap.add_argument("--api", default=DEFAULT_API, help="Kitty API base URL")
    ap.add_argument("--rpc", default=DEFAULT_RPC, help="Nimiq JSON-RPC endpoint")
    ap.add_argument("--goals", default="", help="comma separated goal ids")
    ap.add_argument("--recent", type=int, default=0, help="audit the N most recent goals instead")
    args = ap.parse_args()

    chain = Chain(args.rpc)

    ids = [g.strip() for g in args.goals.split(",") if g.strip()]
    if not ids and args.recent:
        listing = http_json(f"{args.api.rstrip('/')}/v1/goals?recent={args.recent}")
        ids = [g["id"] for g in listing.get("goals", [])]
    if not ids:
        print("Nothing to audit: pass --goals id1,id2 or --recent N", file=sys.stderr)
        return 2

    checked = failed = 0
    for goal_id in ids:
        try:
            c, f = audit_goal(args.api, chain, goal_id)
        except urllib.error.HTTPError as e:
            print(f"\ngoal {goal_id}: API said {e.code}", file=sys.stderr)
            failed += 1
            continue
        checked += c
        failed += f

    print(f"\n{checked} receipts checked, {failed} problem(s)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

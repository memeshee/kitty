import Link from "next/link"
import type { Ledger } from "@/lib/api"
import { lunaToNim, shortAddress, shortHash, when } from "@/lib/format"
import { Slip } from "@/components/kit"

/** The public usage ledger, printed on the proof page.
 *
 *  The competition scores distinct wallets, and the only evidence a stranger can
 *  trust is the chain. So the count, the wallets behind it and the receipts are all
 *  published together: anyone can open a hash and see the payment for themselves.
 */
export function LedgerSlip({ ledger, down }: { ledger: Ledger | null; down: boolean }) {
  if (down || !ledger) {
    return (
      <Slip className="mt-3 p-4">
        <p className="eyebrow">Wallets</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          The ledger is unreadable this second. The payments themselves are on the chain and unaffected.
        </p>
      </Slip>
    )
  }

  return (
    <Slip className="mt-3 p-4" press>
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">Wallets that have paid</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">read {when(ledger.generated_at)}</p>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="tnum text-[30px] leading-none font-medium">{ledger.distinct_wallets}</span>
        <span className="text-[12.5px] text-ink-soft">
          {ledger.distinct_wallets === 1 ? "distinct wallet" : "distinct wallets"} ·{" "}
          {ledger.contributions} {ledger.contributions === 1 ? "receipt" : "receipts"} ·{" "}
          {lunaToNim(ledger.total_luna)} NIM
        </span>
      </div>

      {ledger.wallets.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          No wallets yet. The first receipt will appear here the moment it is verified, with its hash — this is the
          number that grows, not a badge we award ourselves.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          {ledger.wallets.map((address) => (
            <li key={address} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[11.5px] text-ink-soft">{shortAddress(address)}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">paid</span>
            </li>
          ))}
        </ul>
      )}

      {ledger.recent.length > 0 ? (
        <div className="mt-4 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          <p className="eyebrow">Latest receipts</p>
          <ol className="mt-2 grid gap-1.5">
            {ledger.recent.slice(0, 8).map((r) => (
              <li key={r.tx_hash}>
                <Link href={`/r/${r.tx_hash}`} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12.5px] text-ink">
                    {r.display_name?.trim() || shortHash(r.tx_hash)} → {r.goal_title}
                  </span>
                  <span className="tnum shrink-0 text-[12.5px] font-medium">+{lunaToNim(r.amount_luna)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Slip>
  )
}

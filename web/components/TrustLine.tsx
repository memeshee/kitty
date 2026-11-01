import type { Reconciliation } from "@/lib/api"
import { lunaToNim } from "@/lib/format"

/** The trust line. Kitty never holds the money, so the jar's public ledger must
 *  agree with the owner's real wallet on chain. Anyone can compare the two here. */
export function TrustLine({ r }: { r: Reconciliation }) {
  const live = r.balance_luna !== null
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white/40 p-4">
      <p className="text-[13px] leading-relaxed text-slate">
        {live ? (
          <>
            This wallet holds <span className="tnum font-medium text-ink">{lunaToNim(r.balance_luna!)} NIM</span> on
            Nimiq right now; the receipts above add up to{" "}
            <span className="tnum font-medium text-ink">{lunaToNim(r.indexed_luna)} NIM</span>.{" "}
            {r.matches
              ? "Kitty holds none of it: every coin went straight to the owner's wallet."
              : "Some of that balance has been spent or arrived without a memo."}
          </>
        ) : (
          <>
            Receipts add up to <span className="tnum font-medium text-ink">{lunaToNim(r.indexed_luna)} NIM</span>. The
            live wallet balance is unavailable this second; the chain is the source of truth and it will be checked
            again on the next visit.
          </>
        )}
      </p>
      {r.block_number ? (
        <p className="tnum mt-2 text-[11px] text-slate">checked at block {r.block_number.toLocaleString()}</p>
      ) : null}
    </div>
  )
}

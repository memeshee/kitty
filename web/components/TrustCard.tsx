import type { Reconciliation } from "@/lib/api"
import { lunaToNim } from "@/lib/format"

/** The trust slip. Kitty never holds the money, so the jar's public ledger has to
 *  agree with the owner's real wallet. Anyone can compare the two here. */
export function TrustCard({ r }: { r: Reconciliation | null }) {
  if (!r) {
    return (
      <div className="slip p-4">
        <p className="eyebrow">Where the money is</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          The live wallet balance could not be read this second. The receipts above are still real payments on Nimiq,
          and every one of them opens on the chain.
        </p>
      </div>
    )
  }
  const live = r.balance_luna !== null
  return (
    <div className="slip p-4">
      <p className="eyebrow">Where the money is</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
        {live ? (
          <>
            This wallet holds <span className="tnum text-ink">{lunaToNim(r.balance_luna!)} NIM</span> on Nimiq right
            now; the receipts above add up to <span className="tnum text-ink">{lunaToNim(r.indexed_luna)} NIM</span>.{" "}
            {r.matches
              ? "Kitty holds none of it: every coin went straight to the owner."
              : "Some of it has been spent, or arrived without a memo."}
          </>
        ) : (
          <>
            The receipts add up to <span className="tnum text-ink">{lunaToNim(r.indexed_luna)} NIM</span>. The live
            balance is unavailable this second; the chain stays the source of truth.
          </>
        )}
      </p>
      {r.block_number ? (
        <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
          checked at block {r.block_number.toLocaleString("en-US")}
        </p>
      ) : null}
    </div>
  )
}

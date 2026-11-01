import type { Contribution } from "@/lib/api"
import { cn } from "@/lib/cn"
import { lunaToNim, shortAddress, shortHash, when } from "@/lib/format"

/** One printed line per payment, linked to the transaction that proves it.
 *  Paper rules, mono type, no cards: this is a receipt roll, not a feed. */
export function ReceiptList({ contributions }: { contributions: Contribution[] }) {
  if (!contributions.length) {
    return (
      <p className="py-6 text-center text-[13px] leading-relaxed text-ink-faint">
        Receipts print here the moment a coin lands.
      </p>
    )
  }
  return (
    <ol className="divide-y divide-ink/10">
      {contributions.map((c, i) => (
        <li key={c.tx_hash} className="animate-print-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <a
            href={c.explorer_url}
            target="_blank"
            rel="noreferrer noopener"
            className="group grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-2.5 transition-colors hover:bg-amber-wash/50"
          >
            <span className="truncate text-[13.5px]">
              <span className="font-medium text-ink">{c.display_name?.trim() || shortAddress(c.contributor_address)}</span>
              {c.pending ? (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">confirming</span>
              ) : null}
            </span>
            <span className="tnum text-[13.5px] font-medium text-ink">+{lunaToNim(c.amount_luna)}</span>
            <span className="truncate text-[11.5px] text-ink-faint">{c.note || shortHash(c.tx_hash)}</span>
            <span className="justify-self-end font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint group-hover:text-ink">
              {when(c.verified_at ?? new Date().toISOString())}
            </span>
          </a>
        </li>
      ))}
    </ol>
  )
}

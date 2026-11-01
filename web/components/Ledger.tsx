import type { Contribution } from "@/lib/api"
import { lunaToNim, shortAddress, shortHash, when } from "@/lib/format"

/** Receipts, not a dashboard. Each line is a payment that exists on Nimiq and
 *  opens in the explorer, so anyone can check the jar without trusting us. */
export function Ledger({ contributions }: { contributions: Contribution[] }) {
  if (!contributions.length) {
    return (
      <div className="rounded-[20px] border border-dashed border-ink/15 px-5 py-8 text-center">
        <p className="text-[14px] text-slate">Receipts show up here the moment a coin lands.</p>
      </div>
    )
  }
  return (
    <ol className="divide-y divide-ink/8">
      {contributions.map((c, i) => (
        <li
          key={c.tx_hash}
          className="rise flex items-start justify-between gap-4 py-3.5"
          style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
        >
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-medium text-ink">
              {c.display_name?.trim() || shortAddress(c.contributor_address)}
              {c.pending ? <span className="ml-2 text-[11.5px] font-normal text-slate">confirming</span> : null}
            </p>
            {c.note ? <p className="mt-0.5 line-clamp-2 text-[13px] text-slate">{c.note}</p> : null}
            <a
              href={c.explorer_url}
              target="_blank"
              rel="noreferrer noopener"
              className="tnum mt-1 inline-block text-[11.5px] text-slate underline decoration-ink/20 underline-offset-2 hover:text-ink"
            >
              {shortHash(c.tx_hash)} · {when(c.verified_at ?? new Date().toISOString())}
            </a>
          </div>
          <span className="tnum shrink-0 pt-0.5 text-[14.5px] font-medium text-ink">+{lunaToNim(c.amount_luna)}</span>
        </li>
      ))}
    </ol>
  )
}

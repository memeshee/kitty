"use client"

import { cn } from "@/lib/cn"
import { lunaToNim, pct } from "@/lib/format"
import type { Pace } from "@/lib/pace"
import { Amount, BackerTag, StatusChip, Stub, PaceLine, Stamp } from "@/components/kit"
import type { Contribution } from "@/lib/api"

/** The jar itself: one object, readable at arm's length, with its stub torn off
 *  underneath carrying who is in it and how the pace looks. */
export function JarCard({
  raised,
  target,
  pace,
  contributions,
  className,
}: {
  raised: string
  target: string
  pace: Pace
  contributions: Contribution[]
  className?: string
}) {
  const percent = pct(raised, target)
  const R = 96
  const C = 2 * Math.PI * R
  const filled = (percent / 100) * C
  const uniqueBackers = Array.from(new Set(contributions.map((c) => c.contributor_address)))
  const shown = uniqueBackers.slice(0, 5)

  return (
    <section className={cn("slip-press overflow-hidden", className)} aria-label="The jar">
      <div className="px-5 pb-1 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">In the jar</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <Amount luna={raised} className="text-[34px] leading-none font-medium" />
            </p>
            <p className="mt-1 text-[12.5px] text-ink-soft">of {lunaToNim(target)} NIM</p>
          </div>
          <StatusChip status={pace.phase === "met" ? "met" : pace.phase} />
        </div>
      </div>

      <div className="relative mx-auto my-3 h-[212px] w-[212px]">
        <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="110" cy="110" r={R} fill="none" stroke="var(--color-paper-deep)" strokeWidth="15" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke="var(--color-amber)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C}`}
            style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tnum text-[30px] leading-none font-medium">{percent}%</span>
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {pace.phase === "met" ? "the goal is met" : "filled"}
          </span>
          {percent >= 100 ? <div className="mt-2"><Stamp>Full</Stamp></div> : null}
        </div>
      </div>

      <div className="px-5 pb-4">
        <PaceLine pace={pace} />
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{pace.verdict}</p>
      </div>

      <Stub>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {shown.map((address) => {
              const c = contributions.find((x) => x.contributor_address === address)
              return (
                <BackerTag
                  key={address}
                  name={c?.display_name?.trim() || address.slice(2, 6)}
                  seed={address}
                  label={c?.display_name ?? address}
                />
              )
            })}
            {uniqueBackers.length > shown.length ? (
              <BackerTag name={`+${uniqueBackers.length - shown.length}`} seed="more" />
            ) : null}
            {uniqueBackers.length === 0 ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {pace.phase === "closed" ? "closed, no backers" : "be the first"}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
            {uniqueBackers.length} {uniqueBackers.length === 1 ? "person" : "people"}
          </p>
        </div>
      </Stub>
    </section>
  )
}

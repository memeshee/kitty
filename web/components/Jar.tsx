import { lunaToNim, pct } from "@/lib/format"

/** The jar is the product. One object, readable at arm's length: how much is in it,
 *  how far to the target, and who put it there. */
export function Jar({
  raised,
  target,
  contributors,
  days,
  closed = false,
}: {
  raised: string
  target: string
  contributors: number
  days: number
  closed?: boolean
}) {
  const p = pct(raised, target)
  const R = 104
  const C = 2 * Math.PI * R
  const filled = (p / 100) * C

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[248px] w-[248px]">
        <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="120" cy="120" r={R} fill="none" stroke="var(--color-paper-deep)" strokeWidth="16" />
          <circle
            cx="120"
            cy="120"
            r={R}
            fill="none"
            stroke="var(--color-amber)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C}`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tnum text-[34px] leading-none font-medium text-ink">{lunaToNim(raised)}</span>
          <span className="mt-1.5 text-[12.5px] text-slate">of {lunaToNim(target)} NIM</span>
          <span className="mt-3 rounded-full bg-amber-soft px-3 py-1 text-[12px] font-medium text-ink">{p}% there</span>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-slate">
        {contributors === 0
          ? closed
            ? "Closed with an empty jar"
            : "No coins in the jar yet"
          : `${contributors} ${contributors === 1 ? "person has" : "people have"} chipped in`}
        {!closed ? <> · {days > 0 ? `${days} ${days === 1 ? "day" : "days"} left` : "deadline passed"}</> : null}
      </p>
    </div>
  )
}

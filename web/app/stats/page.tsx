import { api } from "@/lib/api"
import { lunaToNim, when } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function Stats() {
  let s = null
  let failed = false
  try {
    s = await api.getStats()
  } catch {
    failed = true
  }

  return (
    <main>
      <a href="/" className="text-[13px] text-slate underline-offset-4 hover:underline">
        Kitty
      </a>
      <h1 className="mt-5 text-[30px] leading-tight font-medium tracking-tight text-ink">Public numbers</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate">
        Every figure here is derived from Nimiq mainnet payments. A contribution only counts if it can be read back from
        the chain, so this page cannot be flattered.
      </p>

      {failed ? (
        <p className="mt-6 text-[14px] text-brick">The numbers are unavailable this second. Try again shortly.</p>
      ) : s ? (
        <dl className="mt-8 divide-y divide-ink/10">
          {[
            ["Jars", String(s.goals)],
            ["Coins in jars", String(s.contributions)],
            ["People who chipped in", String(s.distinct_contributors)],
            ["NIM moved", lunaToNim(s.total_luna)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between py-4">
              <dt className="text-[14px] text-slate">{k}</dt>
              <dd className="tnum text-[20px] font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {s ? <p className="mt-6 text-[12px] text-slate">Read at {when(s.verified_at)}.</p> : null}
    </main>
  )
}

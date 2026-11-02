import Link from "next/link"
import { api } from "@/lib/api"
import { lunaToNim } from "@/lib/format"
import { readPace } from "@/lib/pace"
import { StatusChip, Slip, ProgressTrack, Amount } from "@/components/kit"

export const dynamic = "force-dynamic"

async function load() {
  const [stats, recent] = await Promise.all([
    api.getStats().catch(() => null),
    api.recentGoals().catch(() => ({ goals: [] })),
  ])
  return { stats, goals: recent.goals.slice(0, 4) }
}

export default async function Home() {
  const { stats, goals } = await load()

  return (
    <main>
      <section className="pt-6">
        <p className="eyebrow">Nimiq Pay · Save</p>
        <h1 className="mt-3 text-[38px] leading-[1.02] font-medium tracking-tight">
          A jar your
          <br />
          people fill.
        </h1>
        <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          Name what you are saving for and share one link. Family chips in from their own phones — one tap in Nimiq Pay,
          or straight from any browser. Every coin is a real NIM payment, and the receipts are public.
        </p>
        <div className="mt-6 grid gap-2">
          <Link href="/create" className="stamp-button w-full">
            Start a jar
          </Link>
          <Link href="/proof" className="stamp-button w-full" data-variant="quiet">
            See the proof
          </Link>
        </div>
      </section>

      {goals.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Live jars</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {stats ? `${stats.goals} open` : ""}
            </p>
          </div>
          <ul className="mt-3 grid gap-2.5">
            {goals.map((g) => {
              const pace = readPace(g)
              return (
                <li key={g.id}>
                  <Link href={`/g/${g.id}`} className="slip block p-4 transition hover:bg-amber-wash/40">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] font-medium leading-snug">{g.title}</p>
                      <StatusChip status={pace.phase === "met" ? "met" : pace.phase} />
                    </div>
                    <div className="mt-3">
                      <ProgressTrack percent={pace.percent} />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                      <span>
                        <Amount luna={g.raised_luna} suffix={null} className="text-[12.5px] text-ink" /> of{" "}
                        {lunaToNim(g.target_luna)} NIM
                      </span>
                      <span>{pace.daysLeft > 0 ? `${pace.daysLeft}d left` : "past date"}</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <p className="eyebrow">How it works</p>
        <ul className="mt-3 divide-y divide-ink/10 border-y-[1.5px] border-ink/15">
          {[
            ["Name it", "School fees, a bike, a wedding. A target and a date is all a jar needs."],
            ["Share it", "One link goes to WhatsApp. Anyone with Nimiq Pay chips in, in any amount."],
            ["Watch it fill", "Coins land in your own wallet, not with us, and each one leaves a receipt."],
          ].map(([title, body]) => (
            <li key={title} className="py-3.5">
              <p className="text-[15px] font-medium">{title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <Slip className="mt-8 p-4" press>
        <p className="eyebrow">The rule</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          Kitty never takes custody. A contribution goes straight from the giver&apos;s wallet to the owner&apos;s,
          carrying the jar&apos;s tag on Nimiq. We keep the receipts, and the chain keeps the truth.
        </p>
        {stats && stats.contributions > 0 ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            {stats.contributions} receipts · {stats.distinct_contributors} people · {lunaToNim(stats.total_luna)} NIM
          </p>
        ) : null}
      </Slip>

      <footer className="mt-8 border-t-[1.5px] border-ink/15 pt-4">
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Runs inside Nimiq Pay on the Nimiq mainnet.{" "}
          <a href="https://github.com/memeshee/kitty" className="underline underline-offset-2">
            Source
          </a>
        </p>
      </footer>
    </main>
  )
}

import Link from "next/link"
import { api } from "@/lib/api"
import { lunaToNim, when } from "@/lib/format"
import { readPace } from "@/lib/pace"
import { Slip, StatusChip } from "@/components/kit"

export const dynamic = "force-dynamic"

export default async function ProofPage() {
  let stats = null
  let goals: Awaited<ReturnType<typeof api.recentGoals>>["goals"] = []
  let down = false
  try {
    const [s, g] = await Promise.all([api.getStats(), api.recentGoals()])
    stats = s
    goals = g.goals.slice(0, 6)
  } catch {
    down = true
  }

  return (
    <main className="pt-5">
      <p className="eyebrow">Proof</p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-tight">Every number here comes off the chain</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Kitty is bookkeeping over real NIM payments. It cannot invent a receipt, cannot hold a coin, and cannot sign
        anything. What follows is what that means in practice, and how to check it yourself.
      </p>

      {down ? (
        <div className="slip mt-5 p-4">
          <p className="text-[13.5px] text-brick">The index is unreachable this second. Try again shortly.</p>
        </div>
      ) : stats ? (
        <Slip className="mt-5 p-4" press>
          <p className="eyebrow">Right now</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3">
            {[
              ["Jars", String(stats.goals)],
              ["Receipts", String(stats.contributions)],
              ["People", String(stats.distinct_contributors)],
              ["NIM moved", lunaToNim(stats.total_luna)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{k}</dt>
                <dd className="tnum mt-0.5 text-[22px] leading-none font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            read {when(stats.verified_at)}
          </p>
        </Slip>
      ) : null}

      <section className="mt-8">
        <p className="eyebrow">What a receipt has to pass</p>
        <ol className="mt-3 divide-y divide-ink/10 border-y-[1.5px] border-ink/15">
          {[
            ["The chain has the hash", "Kitty asks Nimiq for the transaction. An unknown hash writes nothing."],
            ["It paid the right person", "The recipient must be the jar owner's address, to the character."],
            ["It carries the jar's tag", "The on-chain memo must start with kitty:<jar id>. A payment without it is refused."],
            ["It actually executed", "A transaction that failed on chain moved no value, so it is not a receipt."],
            ["The amount is the chain's", "Kitty reads the value from the node and ignores what the app claims."],
            ["It only counts once", "A hash can never be recorded twice, so no receipt can be double counted."],
          ].map(([title, body]) => (
            <li key={title} className="py-3">
              <p className="text-[14px] font-medium">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <p className="eyebrow">Check it yourself</p>
        <div className="slip mt-3 p-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Every receipt links to its transaction on a Nimiq explorer. For the whole set at once, this repository
            carries a script that re-derives each stored receipt from the chain and fails loudly when anything does not
            match:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[8px] border-[1.5px] border-ink/20 bg-paper-deep/50 p-3 font-mono text-[11px] leading-relaxed">
{`python3 tools/audit_chain.py \\
  --api https://kitty-api-memeshee.fly.dev \\
  --recent 10`}
          </pre>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
            The same check runs on every contribution before it is stored, which is why the numbers above can be
            trusted to be small and honest rather than large and invented.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <p className="eyebrow">Recent jars</p>
        <ul className="mt-3 grid gap-2">
          {goals.length === 0 ? <li className="text-[13px] text-ink-faint">No jars yet.</li> : null}
          {goals.map((g) => {
            const pace = readPace(g)
            return (
              <li key={g.id}>
                <Link href={`/g/${g.id}`} className="slip flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{g.title}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-ink-faint">
                      {lunaToNim(g.raised_luna)} of {lunaToNim(g.target_luna)} NIM
                    </span>
                  </span>
                  <StatusChip status={pace.phase === "met" ? "met" : pace.phase} />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="mt-8 border-t-[1.5px] border-ink/15 pt-4 text-[11.5px] leading-relaxed text-ink-faint">
        Design notes and the trust boundary are in{" "}
        <a href="https://github.com/memeshee/kitty/blob/main/docs/ARCHITECTURE.md" className="underline underline-offset-2">
          the repository
        </a>
        .
      </p>
    </main>
  )
}

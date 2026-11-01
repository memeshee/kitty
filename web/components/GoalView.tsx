"use client"

import { useState } from "react"
import type { Contribution, GoalDetail } from "@/lib/api"
import { Jar } from "@/components/Jar"
import { Ledger } from "@/components/Ledger"
import { TrustLine } from "@/components/TrustLine"
import { ChipIn } from "@/components/ChipIn"
import { Share } from "@/components/Share"
import { OwnerTools } from "@/components/OwnerTools"
import { dayCount, lunaToNim, shortAddress, when } from "@/lib/format"

export function GoalView({ initial }: { initial: GoalDetail }) {
  const [detail, setDetail] = useState<GoalDetail>(initial)
  const { goal, contributions, thanks, reconciliation } = detail

  function onPaid(contribution: Contribution, raised: string) {
    setDetail((d) => ({
      ...d,
      goal: { ...d.goal, raised_luna: raised, contributors_count: d.goal.contributors_count + (contribution.pending ? 0 : 1) },
      contributions: [contribution, ...d.contributions.filter((c) => c.tx_hash !== contribution.tx_hash)],
    }))
  }

  return (
    <main>
      <a href="/" className="text-[13px] text-slate underline-offset-4 hover:underline">
        Kitty
      </a>

      <header className="mt-5">
        <h1 className="text-[30px] leading-[1.08] font-medium tracking-tight text-ink">{goal.title}</h1>
        {goal.story ? <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">{goal.story}</p> : null}
        <p className="tnum mt-3 text-[12px] text-slate">
          {shortAddress(goal.owner_address)} · started {when(goal.created_at)}
          {goal.status === "closed" ? " · closed" : ""}
        </p>
      </header>

      <section className="mt-7">
        <Jar
          raised={goal.raised_luna}
          target={goal.target_luna}
          contributors={goal.contributors_count}
          days={dayCount(goal.deadline)}
          closed={goal.status === "closed"}
        />
      </section>

      <section className="mt-6">
        <ChipIn goal={goal} onPaid={onPaid} />
      </section>

      <section className="mt-4">
        <Share url={`/g/${goal.id}`} title={goal.title} />
      </section>

      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium text-ink">Receipts</h2>
          <span className="tnum text-[12px] text-slate">
            {detail.stats.contributions_count} in · avg {lunaToNim(detail.stats.average_luna)} NIM
          </span>
        </div>
        <div className="mt-1">
          <Ledger contributions={contributions} />
        </div>
      </section>

      <section className="mt-6">
        <TrustLine r={reconciliation} />
      </section>

      {thanks.length ? (
        <section className="mt-6">
          <h2 className="text-[15px] font-medium text-ink">From the owner</h2>
          <ul className="mt-2 grid gap-2">
            {thanks.map((t) => (
              <li key={t.id} className="rounded-[20px] bg-amber-soft/60 px-4 py-3">
                <p className="text-[14px] leading-relaxed text-ink">{t.body}</p>
                <p className="mt-1 text-[11.5px] text-slate">{when(t.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <OwnerTools goal={goal} />

      <footer className="mt-10 border-t border-ink/10 pt-4">
        <p className="text-[12px] leading-relaxed text-slate">
          Kitty never holds the money and never holds a key. Coins go straight from the giver to the owner&apos;s own
          Nimiq wallet, tagged with this goal, and every receipt above opens on the chain.
        </p>
        <p className="mt-2 text-[12px] text-slate">
          <a href="/stats" className="underline underline-offset-4">
            Public numbers
          </a>{" "}
          ·{" "}
          <a href="https://github.com/memeshee/kitty" className="underline underline-offset-4">
            Source
          </a>
        </p>
      </footer>
    </main>
  )
}

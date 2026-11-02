"use client"

import { useEffect, useMemo, useState } from "react"
import type { Contribution, GoalDetail } from "@/lib/api"
import { cn } from "@/lib/cn"
import { readPace } from "@/lib/pace"
import { nextStep } from "@/lib/nextStep"
import { shortAddress, when } from "@/lib/format"
import { useWallet } from "@/lib/useWallet"
import { JarCard } from "@/components/JarCard"
import { ReceiptList } from "@/components/ReceiptList"
import { NextStepCard } from "@/components/NextStepCard"
import { ChipIn } from "@/components/ChipIn"
import { ShareCard } from "@/components/ShareCard"
import { TrustCard } from "@/components/TrustCard"
import { OwnerTools } from "@/components/OwnerTools"
import { StickyBar } from "@/components/StickyBar"
import { Slip } from "@/components/kit"

export function GoalView({ initial, qrSvg }: { initial: GoalDetail; qrSvg?: string }) {
  const [detail, setDetail] = useState<GoalDetail>(initial)
  const [newCount, setNewCount] = useState(0)
  const wallet = useWallet()
  const { goal, contributions, thanks, reconciliation, stats } = detail

  const pace = useMemo(() => readPace(goal), [goal])
  const isOwner = !!wallet.address && wallet.address === goal.owner_address
  const step = useMemo(
    () => nextStep({ goal, pace, viewerAddress: wallet.address, isOwner, contributions }),
    [goal, pace, wallet.address, isOwner, contributions],
  )

  // A returning visitor is the only signal the platform cannot push, so the page
  // remembers what this browser last saw and says so.
  useEffect(() => {
    const key = `kitty:seen:${goal.id}`
    const newest = contributions.reduce((max, c) => (c.id > max ? c.id : max), 0)
    const seen = Number(window.localStorage.getItem(key) ?? "0")
    if (seen > 0 && newest > seen) {
      setNewCount(contributions.filter((c) => c.id > seen).length)
    }
    if (newest > 0) window.localStorage.setItem(key, String(newest))
  }, [goal.id, contributions])

  function onPaid(contribution: Contribution, raised: string) {
    setDetail((d) => ({
      ...d,
      goal: {
        ...d.goal,
        raised_luna: raised,
        contributors_count: d.goal.contributors_count + (contribution.pending ? 0 : 1),
      },
      contributions: [contribution, ...d.contributions.filter((c) => c.tx_hash !== contribution.tx_hash)],
    }))
  }

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <main className="pb-4">
      <Slip as="header" className="overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Jar · {goal.id}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {goal.status === "closed" ? "closed" : `by ${shortAddress(goal.owner_address)}`}
            </p>
          </div>
          <h1 className="mt-2 text-[27px] leading-[1.1] font-medium tracking-tight">{goal.title}</h1>
          {goal.story ? <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{goal.story}</p> : null}
        </div>
        <div className="perforation flex items-center justify-between border-t-[1.5px] border-dashed border-ink/25 bg-paper-deep/40 px-5 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
            opened {when(goal.created_at)}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">collect by {goal.deadline}</p>
        </div>
      </Slip>

      <div className="mt-4">
        <JarCard raised={goal.raised_luna} target={goal.target_luna} pace={pace} contributions={contributions} />
      </div>

      <div className="mt-4">
        <NextStepCard
          goal={goal}
          pace={pace}
          contributions={contributions}
          viewerAddress={wallet.address}
          isOwner={isOwner}
        />
      </div>

      {newCount > 0 ? (
        <p className="mt-3 rounded-[8px] border-[1.5px] border-ink/15 bg-amber-wash/70 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          {newCount === 1 ? "One new receipt since you last looked." : `${newCount} new receipts since you last looked.`}
        </p>
      ) : null}

      {goal.status === "open" && pace.phase !== "met" ? (
        <div className="mt-4">
          <ChipIn goal={goal} onPaid={onPaid} />
        </div>
      ) : null}

      <div className="mt-4">
        <ShareCard goalId={goal.id} title={goal.title} qrSvg={qrSvg} />
      </div>

      <Slip as="section" className="mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Receipts</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            {stats.contributions_count} in
          </p>
        </div>
        <div className="mt-1">
          <ReceiptList contributions={contributions} />
        </div>
      </Slip>

      <div className="mt-4">
        <TrustCard r={reconciliation} />
      </div>

      {thanks.length ? (
        <Slip as="section" className="mt-4 p-4">
          <p className="eyebrow">From the owner</p>
          <ul className="mt-2 grid gap-2">
            {thanks.map((t) => (
              <li key={t.id} className="rounded-[8px] border-[1.5px] border-ink/15 bg-amber-wash/70 px-3 py-2">
                <p className="text-[13.5px] leading-relaxed text-ink">{t.body}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">{when(t.created_at)}</p>
              </li>
            ))}
          </ul>
        </Slip>
      ) : null}

      <div className="mt-4">
        <OwnerTools goal={goal} />
      </div>

      <footer className="mt-8 border-t-[1.5px] border-ink/15 pt-4">
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Kitty holds no money and no keys. Coins go straight from the giver to the owner&apos;s own Nimiq wallet,
          tagged with this goal, and every receipt above opens on the chain.
        </p>
        <p className="mt-2 flex gap-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
          <a href="/proof" className="hover:text-ink">Proof</a>
          <a href="https://github.com/memeshee/kitty" className="hover:text-ink">Source</a>
          <a href="/" className="hover:text-ink">All jars</a>
        </p>
      </footer>

      {goal.status === "open" && pace.phase !== "met" ? (
        <StickyBar
          goal={goal}
          pace={pace}
          action={isOwner ? "Share" : "Chip in"}
          onAction={() => goTo(isOwner ? "share" : "chipin")}
        />
      ) : null}
    </main>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, type Goal } from "@/lib/api"
import { lunaToNim } from "@/lib/format"
import { readPace } from "@/lib/pace"
import { deeplink } from "@/lib/nimiq"
import { useWallet } from "@/lib/useWallet"
import { ProgressTrack, Slip, StatusChip } from "@/components/kit"

export default function MyJars() {
  const wallet = useWallet()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!wallet.address) return
    let alive = true
    api
      .listGoals(wallet.address)
      .then((r) => alive && setGoals(r.goals))
      .catch(() => alive && setErr("Your jars could not be loaded just now."))
    return () => {
      alive = false
    }
  }, [wallet.address])

  return (
    <main className="pt-5">
      <p className="eyebrow">My jars</p>
      <h1 className="mt-2 text-[26px] leading-tight font-medium tracking-tight">The jars you opened</h1>

      {wallet.inside === false ? (
        <Slip className="mt-4 p-4">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Jars are tied to the wallet that opened them. Open this page in Nimiq Pay to see yours.
          </p>
          <a href={deeplink("/jars") ?? "#"} className="stamp-button mt-3 w-full" data-variant="amber">
            Open in Nimiq Pay
          </a>
        </Slip>
      ) : !wallet.address ? (
        <Slip className="mt-4 p-4">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Link your wallet and your jars appear here.
          </p>
          <button onClick={() => wallet.link()} disabled={wallet.connecting} className="stamp-button mt-3 w-full">
            {wallet.connecting ? "Linking" : "Link wallet"}
          </button>
        </Slip>
      ) : (
        <div className="mt-4">
          {err ? <p className="text-[13px] text-brick">{err}</p> : null}
          {goals === null && !err ? (
            <div className="grid gap-2">
              <Slip className="h-20 animate-pulse" />
              <Slip className="h-20 animate-pulse" />
            </div>
          ) : null}
          {goals && goals.length === 0 ? (
            <Slip className="p-4">
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                No jars on this wallet yet. The first one takes about twenty seconds.
              </p>
              <Link href="/create" className="stamp-button mt-3 w-full" data-variant="amber">
                Open a jar
              </Link>
            </Slip>
          ) : null}
          <ul className="grid gap-2.5">
            {(goals ?? []).map((g) => {
              const pace = readPace(g)
              return (
                <li key={g.id}>
                  <Link href={`/g/${g.id}`} className="slip block p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] font-medium leading-snug">{g.title}</p>
                      <StatusChip status={pace.phase === "met" ? "met" : pace.phase} />
                    </div>
                    <div className="mt-3">
                      <ProgressTrack percent={pace.percent} />
                    </div>
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                      {lunaToNim(g.raised_luna)} of {lunaToNim(g.target_luna)} NIM ·{" "}
                      {pace.daysLeft > 0 ? `${pace.daysLeft}d left` : "past date"}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </main>
  )
}

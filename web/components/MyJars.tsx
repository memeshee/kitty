"use client"

import { useEffect, useState } from "react"
import { api, type Goal } from "@/lib/api"
import { lunaToNim, pct } from "@/lib/format"
import { Skeleton } from "@/components/Bits"

export function MyJars({
  address,
  onConnect,
  connecting,
}: {
  address: string | null
  onConnect: () => Promise<string | null>
  connecting: boolean
}) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    let alive = true
    api
      .listGoals(address)
      .then((r) => alive && setGoals(r.goals))
      .catch(() => alive && setErr("Your jars could not be loaded just now."))
    return () => {
      alive = false
    }
  }, [address])

  if (!address) {
    return (
      <button
        onClick={onConnect}
        disabled={connecting}
        className="w-full rounded-full border border-ink/20 px-6 py-3.5 text-[14px] font-medium text-ink active:scale-[0.99]"
      >
        {connecting ? "Connecting" : "Show my jars"}
      </button>
    )
  }

  return (
    <div className="mt-2">
      {goals === null && !err ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {err ? <p className="text-[13px] text-brick">{err}</p> : null}
      {goals?.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-slate">
          You have not started a jar yet. The first one takes about twenty seconds.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {(goals ?? []).map((g) => (
          <li key={g.id}>
            <a
              href={`/g/${g.id}`}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-ink/10 bg-white/40 px-4 py-3.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-medium text-ink">{g.title}</span>
                <span className="tnum mt-0.5 block text-[12px] text-slate">
                  {lunaToNim(g.raised_luna)} of {lunaToNim(g.target_luna)} NIM
                </span>
              </span>
              <span className="tnum shrink-0 rounded-full bg-amber-soft px-2.5 py-1 text-[11.5px] font-medium text-ink">
                {pct(g.raised_luna, g.target_luna)}%
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

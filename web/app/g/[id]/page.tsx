import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { api, ApiError, type GoalDetail } from "@/lib/api"
import { GoalView } from "@/components/GoalView"
import { Jar } from "@/components/Jar"
import { lunaToNim, pct } from "@/lib/format"

type Loaded = { kind: "ok"; detail: GoalDetail } | { kind: "missing" } | { kind: "down"; message: string }

async function load(id: string): Promise<Loaded> {
  try {
    return { kind: "ok", detail: await api.getGoal(id) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "missing" }
    return { kind: "down", message: e instanceof ApiError ? e.message : "Something went wrong" }
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const r = await load(id)
  if (r.kind !== "ok") return { title: "Kitty" }
  const { goal } = r.detail
  const done = pct(goal.raised_luna, goal.target_luna)
  return {
    title: `${goal.title} · Kitty`,
    description: `${lunaToNim(goal.raised_luna)} of ${lunaToNim(goal.target_luna)} NIM (${done}%). ${
      goal.story || "Chip in from Nimiq Pay."
    }`,
    openGraph: {
      title: goal.title,
      description: `${lunaToNim(goal.raised_luna)} of ${lunaToNim(goal.target_luna)} NIM raised · ${done}%`,
    },
  }
}

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await load(id)
  if (r.kind === "missing") notFound()

  if (r.kind === "down") {
    return (
      <main>
        <a href="/" className="text-[13px] text-slate underline-offset-4 hover:underline">
          Kitty
        </a>
        <div className="mt-10">
          <Jar raised="0" target="1" contributors={0} days={0} />
        </div>
        <div className="mt-8 rounded-[20px] border border-ink/15 p-4">
          <p className="text-[15px] font-medium text-ink">This jar cannot be read right now</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate">
            The index that verifies payments against the chain is not answering. Nothing is lost: the coins are in the
            owner&apos;s wallet on Nimiq, and the receipts reappear here as soon as the index is back.
          </p>
          <a href="" className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper">
            Try again
          </a>
        </div>
      </main>
    )
  }

  return <GoalView initial={r.detail} />
}

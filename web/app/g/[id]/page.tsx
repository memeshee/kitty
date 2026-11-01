import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { api, ApiError, type GoalDetail } from "@/lib/api"
import { GoalView } from "@/components/GoalView"
import { lunaToNim, pct } from "@/lib/format"

async function load(id: string): Promise<GoalDetail | null> {
  try {
    return await api.getGoal(id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const detail = await load(id).catch(() => null)
  if (!detail) return { title: "Jar not found · Kitty" }
  const { goal } = detail
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
  const detail = await load(id)
  if (!detail) notFound()
  return <GoalView initial={detail} />
}

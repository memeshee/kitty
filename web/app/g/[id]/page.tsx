import { notFound } from "next/navigation"
import type { Metadata } from "next"
import QRCode from "qrcode"
import { api, ApiError, type GoalDetail } from "@/lib/api"
import { GoalView } from "@/components/GoalView"
import { JarCard } from "@/components/JarCard"
import { readPace } from "@/lib/pace"
import { lunaToNim, pct } from "@/lib/format"

type Loaded = { kind: "ok"; detail: GoalDetail } | { kind: "missing" } | { kind: "down" }

async function load(id: string): Promise<Loaded> {
  try {
    return { kind: "ok", detail: await api.getGoal(id) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "missing" }
    return { kind: "down" }
  }
}

/** A QR of the jar's own share URL, drawn on the server so the markup and the flyer
 *  can never disagree about where they point. */
async function shareQr(id: string): Promise<string | undefined> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kitty-one-orpin.vercel.app"
  try {
    return await QRCode.toString(`${base}/g/${id}`, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#14261f", light: "#00000000" },
    })
  } catch {
    return undefined
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
      <main className="pt-6">
        <div className="slip p-4">
          <p className="eyebrow">Jar unavailable</p>
          <p className="mt-1.5 text-[15px] leading-snug font-medium">This jar cannot be read right now</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            The index that checks payments against the chain is not answering. Nothing is lost: the coins are in the
            owner&apos;s wallet on Nimiq, and the receipts come back here as soon as it is up.
          </p>
          <a href="" className="stamp-button mt-4 w-full" data-variant="amber">
            Try again
          </a>
        </div>
      </main>
    )
  }

  return <GoalView initial={r.detail} qrSvg={await shareQr(id)} />
}

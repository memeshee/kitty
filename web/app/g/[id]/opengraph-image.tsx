import { ImageResponse } from "next/og"
import { api } from "@/lib/api"
import { lunaToNim, pct } from "@/lib/format"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "A Kitty goal jar"

/** The link is the growth loop, so the link has to look like something worth
 *  opening in a family chat. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let title = "A jar your people fill"
  let raised = "0"
  let target = "1"
  let count = 0
  try {
    const d = await api.getGoal(id)
    title = d.goal.title
    raised = d.goal.raised_luna
    target = d.goal.target_luna
    count = d.goal.contributors_count
  } catch {
    /* a missing jar still gets a card, not a broken image */
  }
  const p = pct(raised, target)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f0e6",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#5f6f66", letterSpacing: -0.5 }}>kitty</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, lineHeight: 1.06, color: "#14261f", letterSpacing: -2 }}>
            {title.length > 64 ? `${title.slice(0, 62)}...` : title}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 28, gap: 16 }}>
            <span style={{ fontSize: 44, color: "#14261f" }}>{lunaToNim(raised)}</span>
            <span style={{ fontSize: 26, color: "#5f6f66" }}>of {lunaToNim(target)} NIM</span>
          </div>
          <div style={{ display: "flex", width: 1040, height: 22, background: "#e9e2d2", borderRadius: 11, marginTop: 18 }}>
            <div style={{ display: "flex", width: `${Math.max(p, 1)}%`, height: 22, background: "#dd9a1e", borderRadius: 11 }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#5f6f66" }}>
          <span>{count === 1 ? "1 person has chipped in" : `${count} people have chipped in`}</span>
          <span>every coin is a public NIM payment</span>
        </div>
      </div>
    ),
    size,
  )
}

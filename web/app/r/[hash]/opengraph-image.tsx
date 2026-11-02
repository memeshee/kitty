import { ImageResponse } from "next/og"
import { api } from "@/lib/api"
import { lunaToNim, shortAddress } from "@/lib/format"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "A Kitty receipt"

/** The card a contributor forwards. It has to look like a receipt, not an ad: the
 *  amount, the jar, and the fact that it came off the chain. */
export default async function Image({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params
  let who = "A friend"
  let amount = "0"
  let title = "A jar your people fill"
  let digest = hash.slice(0, 16)

  try {
    const { contribution, goal } = await api.getReceipt(hash)
    who = contribution.display_name?.trim() || shortAddress(contribution.contributor_address)
    amount = lunaToNim(contribution.amount_luna)
    title = goal.title
    digest = `${hash.slice(0, 10)}…${hash.slice(-6)}`
  } catch {
    /* a missing receipt still gets a card, not a broken image */
  }

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
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#5f6f66" }}>
          <span>kitty · receipt</span>
          <span>verified on Nimiq</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 60, color: "#14261f", letterSpacing: -1.5 }}>
            {who.length > 40 ? `${who.slice(0, 38)}...` : who}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 18, gap: 18 }}>
            <span style={{ fontSize: 84, color: "#14261f" }}>+{amount}</span>
            <span style={{ fontSize: 32, color: "#5f6f66" }}>NIM</span>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "#5f6f66" }}>
            {title.length > 56 ? `${title.slice(0, 54)}...` : title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#8a9a90" }}>
          <span>{digest}</span>
          <span>every coin is a public NIM payment</span>
        </div>
      </div>
    ),
    { ...size },
  )
}

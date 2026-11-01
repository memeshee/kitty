"use client"

import { useEffect, useState } from "react"
import { deeplink } from "@/lib/nimiq"
import { useToast } from "@/components/Toaster"

/** The growth loop is a link, so sharing gets a first-class slip of its own:
 *  WhatsApp first, because that is where these collections already happen. */
export function ShareCard({ goalId, title }: { goalId: string; title: string }) {
  const toast = useToast()
  const [url, setUrl] = useState("")
  const [pay, setPay] = useState<string | null>(null)

  useEffect(() => {
    setUrl(`${window.location.origin}/g/${goalId}`)
    setPay(deeplink(`/g/${goalId}`))
  }, [goalId])

  const text = `${title} - chip in here: ${url}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.push({ title: "Link copied", body: "Paste it into the group chat." })
    } catch {
      toast.push({ title: "Could not copy", body: "Long-press the link and copy it.", tone: "brick" })
    }
  }

  return (
    <section id="share" aria-label="Share this jar" className="slip p-4">
      <p className="eyebrow">Share the jar</p>
      <p className="mt-1 break-all font-mono text-[12px] text-ink-soft">{url || `/g/${goalId}`}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="stamp-button min-h-[44px] px-4 text-[13.5px]"
          data-variant="amber"
        >
          Send on WhatsApp
        </a>
        <button onClick={copy} className="chip">
          Copy link
        </button>
        {pay ? (
          <a href={pay} className="chip text-[12px]">
            Open in Pay
          </a>
        ) : null}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
        Anyone with Nimiq Pay can chip in from the link. Everyone else can still read the jar.
      </p>
    </section>
  )
}

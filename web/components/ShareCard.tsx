"use client"

import { useEffect, useState } from "react"
import { deeplink } from "@/lib/nimiq"
import { useToast } from "@/components/Toaster"

/** The growth loop is a link, so sharing gets a first-class slip of its own:
 *  WhatsApp first, because that is where these collections already happen. The QR
 *  is for the other half of the loop - a jar on a table, a class, an office - and it
 *  works now that anyone can pay from a browser. */
export function ShareCard({ goalId, title, qrSvg }: { goalId: string; title: string; qrSvg?: string }) {
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
      {qrSvg ? (
        <div className="mt-4 flex items-center gap-3 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          <div
            aria-hidden
            className="h-[92px] w-[92px] shrink-0 [&>svg]:h-full [&>svg]:w-full"
            // The QR is rendered on the server from the same share URL, so it can
            // never point somewhere the link does not.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-[11.5px] leading-relaxed text-ink-soft">
            Print it, or show it on your phone. Anyone who scans it can chip in from a normal browser — no app to
            install.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
        Anyone with a Nimiq wallet can chip in from the link. Everyone else can still read every receipt.
      </p>
    </section>
  )
}

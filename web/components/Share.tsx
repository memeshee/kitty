"use client"

import { useEffect, useState } from "react"

/** The growth loop is a link, so sharing has to be the easiest thing on the page.
 *  WhatsApp first: that is where these collections actually happen. */
export function Share({ url, title }: { url: string; title: string }) {
  const [full, setFull] = useState(url)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && url.startsWith("/")) setFull(`${window.location.origin}${url}`)
  }, [url])

  const text = `${title} - chip in here: ${full}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper active:scale-[0.98]"
      >
        Send on WhatsApp
      </a>
      <button
        onClick={copy}
        className="rounded-full border border-ink/20 px-5 py-2.5 text-[13.5px] font-medium text-ink active:scale-[0.98]"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.share) navigator.share({ title, url: full }).catch(() => {})
          else copy()
        }}
        className="rounded-full px-3 py-2.5 text-[13.5px] text-slate underline underline-offset-4"
      >
        More
      </button>
    </div>
  )
}

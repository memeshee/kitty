"use client"

import { useEffect, useState } from "react"
import { inNimiqPay } from "@/lib/nimiq"

/** Shown whenever the page is open in a normal browser. A goal link should still
 *  make sense to someone who does not have Nimiq Pay yet, and it has to stay
 *  honest about what they can do from here. */
export function OutsideNotice({ compact = false }: { compact?: boolean }) {
  const [inside, setInside] = useState<boolean | null>(null)
  const [link, setLink] = useState("")

  useEffect(() => {
    setInside(inNimiqPay())
    if (typeof window !== "undefined") {
      setLink(`https://nimpay.app/miniapps/open/${window.location.host}${window.location.pathname}`)
    }
  }, [])

  if (inside !== false) return null

  if (compact) {
    return (
      <a
        href={link}
        className="block rounded-[20px] bg-ink px-5 py-4 text-center text-[14.5px] font-medium text-paper active:scale-[0.99]"
      >
        Open in Nimiq Pay to chip in
      </a>
    )
  }

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white/40 p-4">
      <p className="text-[14px] font-medium text-ink">You are reading this in a browser</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate">
        Chipping in happens inside Nimiq Pay, where the wallet lives. Open this page there and the jar becomes
        payable. No account, no sign-up, no password.
      </p>
      {link ? (
        <a
          href={link}
          className="mt-3 inline-block rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper active:scale-[0.98]"
        >
          Open in Nimiq Pay
        </a>
      ) : null}
    </div>
  )
}

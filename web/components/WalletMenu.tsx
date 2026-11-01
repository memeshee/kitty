"use client"

import { useEffect, useRef, useState } from "react"
import { addressKey } from "@/lib/api"
import { cn } from "@/lib/cn"
import { shortAddress } from "@/lib/format"
import { deeplink, inNimiqPay, hostNetwork } from "@/lib/nimiq"
import { useWallet } from "@/lib/useWallet"
import { useToast } from "@/components/Toaster"

/** The wallet pill. Shows what the wallet is doing, and nothing more: no account
 *  settings, because Kitty has no accounts. */
export function WalletMenu() {
  const wallet = useWallet()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  if (wallet.inside === false) {
    return (
      <a
        href={deeplink("/") ?? "#"}
        className="rounded-full border-[1.5px] border-ink bg-paper-light px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em]"
      >
        Open in Pay
      </a>
    )
  }

  if (!wallet.address) {
    return (
      <button
        onClick={() => wallet.link()}
        disabled={wallet.connecting}
        className="rounded-full border-[1.5px] border-ink bg-amber px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink"
      >
        {wallet.connecting ? "Linking" : "Link wallet"}
      </button>
    )
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-paper-light px-3 py-1.5 font-mono text-[11px]"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-moss" />
        {shortAddress(wallet.address)}
      </button>
      {open ? (
        <div role="menu" className="animate-rise slip-press absolute right-0 top-[calc(100%+8px)] z-40 w-60 p-3">
          <p className="eyebrow">Wallet</p>
          <p className="tnum mt-1 break-all text-[11.5px] leading-relaxed text-ink-soft">{wallet.address}</p>
          <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
            Nimiq {hostNetwork()}
          </p>
          <div className="mt-3 grid gap-1.5">
            <a href="/jars" className="rounded-[6px] px-2 py-1.5 text-[13px] hover:bg-amber-wash" role="menuitem">
              My jars
            </a>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(wallet.address ?? "").catch(() => {})
                toast.push({ title: "Address copied" })
                setOpen(false)
              }}
              className="rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-amber-wash"
              role="menuitem"
            >
              Copy address
            </button>
            <button
              onClick={() => {
                window.localStorage.removeItem(addressKey)
                window.location.reload()
              }}
              className="rounded-[6px] px-2 py-1.5 text-left text-[13px] text-ink-soft hover:bg-amber-wash"
              role="menuitem"
            >
              Forget this wallet
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

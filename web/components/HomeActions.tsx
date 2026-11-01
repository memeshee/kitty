"use client"

import { OutsideNotice } from "@/components/OpenInPay"
import { MyJars } from "@/components/MyJars"
import { useWallet } from "@/lib/useWallet"

/** The only two things possible on the home screen: start a jar, or open one you
 *  already own. Handles the "opened in a browser" case honestly. */
export function HomeActions() {
  const wallet = useWallet()

  return (
    <div className="grid gap-3">
      <a
        href="/new"
        className="w-full rounded-full bg-ink px-6 py-4 text-center text-[15px] font-medium text-paper active:scale-[0.99]"
      >
        Start a jar
      </a>
      <OutsideNotice />
      {wallet.inside ? <MyJars address={wallet.address} onConnect={wallet.link} connecting={wallet.connecting} /> : null}
    </div>
  )
}

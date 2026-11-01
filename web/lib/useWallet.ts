"use client"

import { useCallback, useEffect, useState } from "react"
import { addressKey } from "@/lib/api"
import { connect, inNimiqPay, hostNetwork } from "@/lib/nimiq"

type State = {
  inside: boolean
  address: string | null
  network: "mainnet" | "testnet"
  connecting: boolean
  error: string | null
}

/** Wallet state for the app surfaces. Identity is the wallet address, re-read per
 *  session, because Nimiq Pay wipes WebView cookies between launches. */
export function useWallet() {
  const [state, setState] = useState<State>({
    inside: false,
    address: null,
    network: "mainnet",
    connecting: false,
    error: null,
  })

  useEffect(() => {
    const inside = inNimiqPay()
    const remembered = typeof window !== "undefined" ? window.localStorage.getItem(addressKey) : null
    setState((s) => ({ ...s, inside, network: hostNetwork(), address: remembered }))
  }, [])

  const link = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }))
    try {
      const address = await connect()
      window.localStorage.setItem(addressKey, address)
      setState((s) => ({ ...s, connecting: false, address }))
      return address
    } catch (e) {
      const msg = (e as Error)?.message ?? "Could not connect the wallet"
      setState((s) => ({ ...s, connecting: false, error: msg }))
      return null
    }
  }, [])

  return { ...state, link }
}

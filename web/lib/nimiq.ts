"use client"

/** The wallet layer. Everything here is a request to Nimiq Pay: the app can ask,
 *  the wallet decides, and the user approves each action in a native dialog.
 *
 *  Types come from @nimiq/mini-app-sdk 0.2.4, which also declares `window.nimiqPay`
 *  globally. We never redeclare that surface: the host owns it. */

import type { NimiqProvider } from "@nimiq/mini-app-sdk"

/** True when the page is running inside Nimiq Pay. The host context is injected
 *  before our scripts run, so this is safe to read on first paint. */
export function inNimiqPay(): boolean {
  return typeof window !== "undefined" && !!window.nimiqPay
}

/** mainnet unless the host explicitly says testnet. Kitty ships on mainnet, and
 *  the competition only accepts mainnet entries. */
export function hostNetwork(): "mainnet" | "testnet" {
  return typeof window !== "undefined" && window.nimiqPay?.network === "testnet" ? "testnet" : "mainnet"
}

export function hostLanguage(): string {
  if (typeof window === "undefined") return "en"
  return window.nimiqPay?.language ?? "en"
}

/** The https deeplink form works with any domain, so a shared goal link can hand
 *  the same page to Nimiq Pay with full provider access. */
export function deeplink(path = ""): string | null {
  if (typeof window === "undefined") return null
  return `https://nimpay.app/miniapps/open/${window.location.host}${path || window.location.pathname}`
}

/** Methods on older hosts can still answer with a legacy `{ error }` object instead
 *  of throwing. One place converts that shape into a real Error. */
function legacyError(res: unknown): Error {
  const r = res as { error?: { type?: string; message?: string; code?: number } }
  const e = new Error(r?.error?.message ?? "Nimiq Pay could not complete that request")
  ;(e as Error & { type?: string; code?: number }).type = r?.error?.type
  ;(e as Error & { type?: string; code?: number }).code = r?.error?.code
  return e
}

let cached: NimiqProvider | null = null

/** init() throws a plain Error if the provider never appears, which is also how we
 *  detect that someone opened a goal link in a normal browser. */
export async function provider(): Promise<NimiqProvider> {
  if (cached) return cached
  const sdk = await import("@nimiq/mini-app-sdk")
  cached = await sdk.init({ timeout: 10_000 })
  return cached
}

export async function connect(): Promise<string> {
  const p = await provider()
  const accounts = await p.listAccounts()
  if (!Array.isArray(accounts)) throw legacyError(accounts)
  if (!accounts.length) throw new Error("No Nimiq account was shared with Kitty")
  return accounts[0]
}

export type PayInput = { recipient: string; luna: string; memo: string }

/** One native NIM payment carrying the goal memo. The user sees the recipient, the
 *  amount, the fee and the memo, and approves or cancels. A returned hash is NOT a
 *  confirmation: the API re-reads the chain before the coin appears in the jar. */
export async function pay({ recipient, luna, memo }: PayInput): Promise<string> {
  const value = Number(luna)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("That amount is not payable")
  if (new TextEncoder().encode(memo).length > 64) throw new Error("The goal tag does not fit in a Nimiq memo")
  const p = await provider()
  const hash = await p.sendBasicTransactionWithData({ recipient, value, data: memo })
  if (typeof hash !== "string") throw legacyError(hash)
  return hash
}

/** Read-only public balance. Used for the trust line, which is allowed to be
 *  unavailable: the chain stays the source of truth either way. */
export async function balanceOf(address: string): Promise<number | null> {
  try {
    const p = await provider()
    const res = await p.getBalance(address)
    return typeof res === "number" ? res : null
  } catch {
    return null
  }
}

/** Cancelling in the wallet is a normal outcome, not a failure. */
export function wasCancelled(e: unknown): boolean {
  const x = e as { type?: string; code?: number }
  return x?.code === 4001 || x?.type === "PERMISSION_DENIED"
}

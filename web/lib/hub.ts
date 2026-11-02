"use client"

/** The browser rail.
 *
 *  Nimiq Pay is a phone app (1K+ Android installs) and most people who receive a jar
 *  link open it in an ordinary browser. Telling them to install something is how a
 *  collection dies in the group chat, so anyone with a Nimiq wallet can pay straight
 *  from the link: the Nimiq Hub opens, the user approves, and the transaction carries
 *  the same `kitty:<id>` memo as the in-app rail.
 *
 *  One memo, one verifier, two rails. The hub can only *pay*: its account-management
 *  surface is privileged to Nimiq's own wallet, so a browser visitor can contribute
 *  but cannot be minted as a jar owner. That asymmetry is fine, and it is why the
 *  owner path stays inside Nimiq Pay.
 */

/** The Hub host. Overridable so a testnet build can point at the testnet Hub. */
const HUB_URL = "https://hub.nimiq.com"
const APP_NAME = "Kitty"

type HubApi = {
  checkout: (request: Record<string, unknown>) => Promise<unknown>
}

let cached: HubApi | null = null

type SignedTransaction = { hash?: string; serializedTx?: string; raw?: { extraData?: Uint8Array } }

/** Loads @nimiq/hub-api lazily: the in-app rail must never pay for it. */
async function hub(): Promise<HubApi> {
  if (cached) return cached
  const mod = (await import("@nimiq/hub-api")) as unknown as { default: new (url: string) => HubApi }
  cached = new mod.default(HUB_URL)
  return cached
}

export type HubPayInput = { recipient: string; luna: string; memo: string }

/**
 * Asks the Hub for one NIM payment carrying the goal memo.
 *
 * Returns the transaction hash the Hub broadcast. As with the in-app rail, the hash
 * is a claim, not a receipt: the API re-reads the chain before anything is printed.
 */
export async function payWithHub({ recipient, luna, memo }: HubPayInput): Promise<string> {
  const value = Number(luna)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("That amount is not payable")
  if (new TextEncoder().encode(memo).length > 64) throw new Error("The goal tag does not fit in a Nimiq memo")

  const api = await hub()
  const signed = (await api.checkout({
    appName: APP_NAME,
    recipient,
    value,
    fee: 0,
    // Exactly the same field the Mini App provider calls `data`, and the same field
    // the verifier reads off the chain. This is what makes the browser rail real.
    extraData: memo,
  })) as SignedTransaction | string

  const hash = typeof signed === "string" ? signed : signed?.hash
  if (typeof hash !== "string" || !hash) {
    throw new Error("Nimiq Hub did not return a transaction")
  }
  return hash
}

/** Closing the Hub popup is a decision, not a failure. */
export function hubCancelled(e: unknown): boolean {
  const message = String((e as Error)?.message ?? "")
  return /cancel/i.test(message)
}

/** A blocked popup is the one failure that has a real instruction for the user. */
export function hubPopupBlocked(e: unknown): boolean {
  const message = String((e as Error)?.message ?? "")
  return /popup|blocked|window/i.test(message)
}

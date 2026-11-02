"use client"

import { useState } from "react"
import { api, ApiError, type Contribution, type Goal } from "@/lib/api"
import { cn } from "@/lib/cn"
import { lunaToNim, nimToLuna } from "@/lib/format"
import { hubCancelled, hubPopupBlocked, payWithHub } from "@/lib/hub"
import { deeplink, pay, wasCancelled } from "@/lib/nimiq"
import { useWallet } from "@/lib/useWallet"
import { Button, Field, Input, Slip } from "@/components/kit"
import { useToast } from "@/components/Toaster"

type Phase = "form" | "wallet" | "chain" | "done"

const PRESETS = ["1", "5", "20", "50"]

/**
 * Two rails, one verifier.
 *
 * Inside Nimiq Pay the wallet is already there and the host raises its own approval
 * sheet. In any other browser the Nimiq Hub does the same job straight from the link,
 * because a collection that requires an install loses most of the people it was sent
 * to. Both rails put `kitty:<id>` in the on-chain memo, and neither is trusted: the
 * API re-reads the chain before a receipt is printed.
 */
export function ChipIn({
  goal,
  onPaid,
}: {
  goal: Goal
  onPaid: (c: Contribution, raised: string) => void
}) {
  const wallet = useWallet()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>("form")
  const [amount, setAmount] = useState("5")
  const [custom, setCustom] = useState("")
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  const value = custom.trim() || amount
  const busy = phase === "wallet" || phase === "chain"
  const inApp = wallet.inside === true
  const link = deeplink(`/g/${goal.id}`)

  async function submit() {
    setError(null)
    let luna: string
    try {
      luna = nimToLuna(value)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    if (BigInt(luna) < 1n) {
      setError("Pick an amount above zero")
      return
    }
    if (wallet.inside === null) {
      setError("Still reading the wallet. Give it a second.")
      return
    }

    setPhase("wallet")
    try {
      const txHash = inApp
        ? await pay({ recipient: goal.owner_address, luna, memo: goal.memo })
        : await payWithHub({ recipient: goal.owner_address, luna, memo: goal.memo })

      setPhase("chain")
      const { contribution, goal: updated } = await api.contribute(goal.id, {
        tx_hash: txHash,
        display_name: name.trim() || undefined,
        note: note.trim() || undefined,
      })
      onPaid(contribution, updated.raised_luna)
      setPhase("done")
      toast.push({ title: "In the jar", body: `${lunaToNim(contribution.amount_luna)} NIM verified on the chain.` })
    } catch (e) {
      setPhase("form")
      if (wasCancelled(e) || hubCancelled(e)) return
      if (hubPopupBlocked(e)) {
        setError(
          "Your browser blocked the wallet window. Allow pop-ups for this site, or open this jar inside Nimiq Pay.",
        )
        return
      }
      if (e instanceof ApiError && e.code === "duplicate") {
        setError("That payment is already in the jar")
        return
      }
      if (e instanceof ApiError && e.code === "pending") {
        setError("The chain has not confirmed it yet. It will appear here in a few seconds.")
        return
      }
      const message = e instanceof ApiError ? e.message : ((e as Error)?.message ?? "The payment did not go through")
      setError(message)
      toast.push({ title: "Not paid", body: message, tone: "brick" })
    }
  }

  return (
    <Slip as="section" press className="p-4">
      <div id="chipin" className="scroll-mt-24" />
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">Chip in</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">straight to the owner</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setAmount(p)
              setCustom("")
            }}
            className={cn("chip", !custom && amount === p && "bg-ink text-paper-light")}
            aria-pressed={!custom && amount === p}
          >
            {p}
          </button>
        ))}
        <Input
          inputMode="decimal"
          placeholder="Other"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-[86px] !min-h-[44px] rounded-full text-center"
          aria-label="Another amount in NIM"
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">NIM</span>
      </div>

      <div className="mt-4 grid gap-3">
        <Field label="Your name" hint="Optional. It prints on the receipt." id="chip-name">
          <Input id="chip-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} placeholder="Chi Lan" />
        </Field>
        <Field label="A note" hint="Optional." id="chip-note">
          <Input id="chip-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="For the books" />
        </Field>
      </div>

      {error ? (
        <p className="mt-3 text-[12.5px] text-brick" role="alert">
          {error}
        </p>
      ) : null}

      <Button onClick={submit} disabled={busy || wallet.inside === null} className="mt-4 w-full">
        {phase === "wallet"
          ? inApp
            ? "Confirm in Nimiq Pay"
            : "Approve in your wallet"
          : phase === "chain"
            ? "Checking the chain"
            : `Chip in ${value || "0"} NIM`}
      </Button>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
        {phase === "chain"
          ? "The chain is the source of truth: Kitty re-reads the payment before it prints."
          : inApp
            ? "You approve it in Nimiq Pay, with the goal tag inside the wallet's own dialog."
            : "You approve it in your own Nimiq wallet — nothing to install, and Kitty never holds the coin."}
      </p>

      {!inApp && link ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
          On your phone?{" "}
          <a href={link} className="underline underline-offset-2">
            Open this jar in Nimiq Pay
          </a>{" "}
          and it is one tap.
        </p>
      ) : null}
    </Slip>
  )
}

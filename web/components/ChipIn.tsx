"use client"

import { useState } from "react"
import { api, ApiError, type Contribution, type Goal } from "@/lib/api"
import { cn } from "@/lib/cn"
import { lunaToNim, nimToLuna } from "@/lib/format"
import { deeplink, pay, wasCancelled } from "@/lib/nimiq"
import { useWallet } from "@/lib/useWallet"
import { Button, Field, Input, Slip } from "@/components/kit"
import { useToast } from "@/components/Toaster"

type Phase = "form" | "wallet" | "chain" | "done"

const PRESETS = ["1", "5", "20", "50"]

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
    if (!wallet.inside) {
      setError("Chipping in needs the Nimiq Pay wallet")
      return
    }

    setPhase("wallet")
    try {
      const txHash = await pay({ recipient: goal.owner_address, luna, memo: goal.memo })
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
      if (wasCancelled(e)) {
        setPhase("form")
        return
      }
      setPhase("form")
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

      {wallet.inside === false ? (
        <div className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            You are reading this in a browser. Open the jar in Nimiq Pay and it becomes payable in one tap.
          </p>
          <a href={deeplink(`/g/${goal.id}`) ?? "#"} className="stamp-button mt-3 w-full" data-variant="amber">
            Open in Nimiq Pay
          </a>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
            The jar stays readable here either way, and the receipts are public.
          </p>
        </div>
      ) : wallet.inside === null ? (
        <p className="mt-3 text-[13px] text-ink-faint">Looking for Nimiq Pay…</p>
      ) : (
        <>
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

          <Button onClick={submit} disabled={busy} className="mt-4 w-full">
            {phase === "wallet" ? "Confirm in Nimiq Pay" : phase === "chain" ? "Checking the chain" : `Chip in ${value || "0"} NIM`}
          </Button>

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            {phase === "chain"
              ? "The chain is the source of truth: Kitty re-reads the payment before it prints."
              : "You approve it in Nimiq Pay, with the goal tag inside the wallet's own dialog."}
          </p>
        </>
      )}
    </Slip>
  )
}

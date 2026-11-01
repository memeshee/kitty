"use client"

import { useState } from "react"
import { api, ApiError, type Contribution, type Goal } from "@/lib/api"
import { lunaToNim, nimToLuna } from "@/lib/format"
import { pay, wasCancelled } from "@/lib/nimiq"
import { Button, Field, inputClass } from "@/components/Bits"
import { OutsideNotice } from "@/components/OpenInPay"
import { useWallet } from "@/lib/useWallet"

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
  const [phase, setPhase] = useState<Phase>("form")
  const [amount, setAmount] = useState("5")
  const [custom, setCustom] = useState("")
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  const value = custom.trim() || amount
  const closed = goal.status === "closed"

  if (phase === "done") {
    return (
      <div className="rounded-[20px] bg-ink px-5 py-6 text-center">
        <p className="text-[15px] font-medium text-paper">In the jar</p>
        <p className="mt-1 text-[13px] leading-relaxed text-paper/70">
          {lunaToNim(goal.raised_luna)} NIM is public on Nimiq under this goal. Nothing of it is with Kitty.
        </p>
        <button
          onClick={() => {
            setPhase("form")
            setNote("")
            setCustom("")
          }}
          className="mt-4 text-[13px] font-medium text-paper underline underline-offset-4"
        >
          Chip in again
        </button>
      </div>
    )
  }

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
    } catch (e) {
      if (wasCancelled(e)) {
        setPhase("form")
        return
      }
      if (e instanceof ApiError && e.code === "duplicate") {
        setPhase("form")
        setError("That payment is already in the jar")
        return
      }
      if (e instanceof ApiError && e.code === "pending") {
        setPhase("form")
        setError("The chain has not confirmed it yet. Give it a few seconds and it will appear here.")
        return
      }
      setPhase("form")
      setError(e instanceof ApiError ? e.message : ((e as Error)?.message ?? "The payment did not go through"))
    }
  }

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white/40 p-4">
      <OutsideNotice compact />

      {closed ? (
        <p className="text-[14px] text-slate">This jar is closed. The receipts stay public.</p>
      ) : (
        <div className={wallet.inside ? "" : "hidden"}>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setAmount(p)
                  setCustom("")
                }}
                className={`tnum rounded-full px-4 py-2 text-[13.5px] font-medium transition active:scale-[0.97] ${
                  !custom && amount === p ? "bg-ink text-paper" : "bg-paper-deep text-ink"
                }`}
              >
                {p} NIM
              </button>
            ))}
            <input
              inputMode="decimal"
              placeholder="Other"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
              className="tnum w-[92px] rounded-full border border-ink/15 bg-white/60 px-4 py-2 text-[13.5px] text-ink placeholder:text-slate/70"
            />
          </div>

          <div className="mt-4 grid gap-3">
            <Field label="Your name (optional)">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 32))}
                placeholder="Shown on the receipt"
                className={inputClass}
              />
            </Field>
            <Field label="A note (optional)">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 120))}
                placeholder="Good luck with term one"
                className={inputClass}
              />
            </Field>
          </div>

          {error ? <p className="mt-3 text-[13px] text-brick">{error}</p> : null}

          <Button
            onClick={submit}
            disabled={phase !== "form"}
            className="mt-4 w-full"
          >
            {phase === "form" ? `Chip in ${value || "0"} NIM` : null}
            {phase === "wallet" ? "Confirm in Nimiq Pay" : null}
            {phase === "chain" ? "Checking the chain" : null}
          </Button>

          <p className="mt-3 text-[12px] leading-relaxed text-slate">
            {phase === "chain"
              ? "The chain is the source of truth here. Kitty re-reads the payment before it shows up."
              : "You approve the payment in Nimiq Pay. It goes straight to the owner's own wallet, with the goal tag attached."}
          </p>
        </div>
      )}
    </div>
  )
}

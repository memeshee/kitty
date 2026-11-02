"use client"

import { useEffect, useState } from "react"
import { api, ApiError, ownerKey, type Goal } from "@/lib/api"
import { Button, Field, Input, Slip } from "@/components/kit"
import { useToast } from "@/components/Toaster"

/** Owner-only controls. The token lives in this browser only. It can print a
 *  thank-you or close the jar; it can never move money, because nobody can. */
export function OwnerTools({ goal }: { goal: Goal }) {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // A manage link carries the owner token in the URL once, then it lives in this
    // browser like it always did. It buys thank-yous and closing, never money.
    const fromUrl = new URLSearchParams(window.location.search).get("owner")
    if (fromUrl) {
      window.localStorage.setItem(ownerKey(goal.id), fromUrl)
      const clean = new URL(window.location.href)
      clean.searchParams.delete("owner")
      window.history.replaceState({}, "", clean.toString())
    }
    setToken(window.localStorage.getItem(ownerKey(goal.id)))
  }, [goal.id])

  if (!token) return null

  async function send() {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      await api.addThanks(goal.id, token, body.trim())
      setBody("")
      toast.push({ title: "Thank-you printed", body: "It shows above the receipts now." })
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not post that"
      setErr(message)
      toast.push({ title: "Not posted", body: message, tone: "brick" })
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      await api.closeGoal(goal.id, token)
      toast.push({ title: "Jar closed", body: "The receipts stay public." })
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not close the jar")
      setBusy(false)
    }
  }

  return (
    <Slip as="section" className="p-4">
      <div id="owner-tools" className="scroll-mt-24" />
      <p className="eyebrow">Your jar</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
        Only this browser can post here. Keep the link with the owner key to manage this jar elsewhere.
      </p>
      <div className="mt-3">
        <Field label="Thank the people who chipped in" id="thanks-body">
          <textarea
            id="thanks-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="We made term one. Thank you all."
            className="field resize-none"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={send} disabled={busy || body.trim().length < 2} variant="amber">
          Post thank-you
        </Button>
        {goal.status === "open" ? (
          <button onClick={close} disabled={busy} className="chip text-[12px]">
            Close jar
          </button>
        ) : null}
      </div>
      {err ? <p className="mt-2 text-[12.5px] text-brick">{err}</p> : null}
    </Slip>
  )
}

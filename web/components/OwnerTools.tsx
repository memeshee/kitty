"use client"

import { useEffect, useState } from "react"
import { api, ApiError, ownerKey, type Goal } from "@/lib/api"
import { Button } from "@/components/Bits"

/** Owner-only controls. The token lives in this browser only. It can post a
 *  thank-you or close the jar; it can never move money, because nobody can. */
export function OwnerTools({ goal }: { goal: Goal }) {
  const [token, setToken] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setToken(window.localStorage.getItem(ownerKey(goal.id)))
  }, [goal.id])

  if (!token) return null

  async function send() {
    if (!token) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      await api.addThanks(goal.id, token, body.trim())
      setBody("")
      setMsg("Posted. Contributors will see it above.")
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not post that")
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
      window.location.reload()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not close the jar")
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 rounded-[20px] border border-ink/15 p-4">
      <h2 className="text-[15px] font-medium text-ink">Your jar</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
        Only this browser can post here. Keep the link with the owner key if you want to manage this jar from another
        device.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 280))}
        placeholder="Thank the people who chipped in"
        rows={3}
        className="mt-3 w-full rounded-[12px] border border-ink/15 bg-white/60 px-4 py-3 text-[14px] text-ink placeholder:text-slate/70"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={send} disabled={busy || body.trim().length < 2}>
          Post thank-you
        </Button>
        {goal.status === "open" ? (
          <button onClick={close} disabled={busy} className="px-2 text-[13px] text-slate underline underline-offset-4">
            Close jar
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-[12.5px] text-slate">{msg}</p> : null}
      {err ? <p className="mt-2 text-[12.5px] text-brick">{err}</p> : null}
    </section>
  )
}

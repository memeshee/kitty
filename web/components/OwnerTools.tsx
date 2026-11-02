"use client"

import { useEffect, useState } from "react"
import { api, ApiError, ownerKey, type Goal } from "@/lib/api"
import { lunaToNim, nimToLuna } from "@/lib/format"
import { Button, Field, Input, Slip } from "@/components/kit"
import { useToast } from "@/components/Toaster"

/** Owner-only controls. The token lives in this browser only. It can print a
 *  thank-you, fix a typo, or close the jar; it can never move money, because
 *  nobody can. */
export function OwnerTools({ goal }: { goal: Goal }) {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [story, setStory] = useState(goal.story)
  const [target, setTarget] = useState(lunaToNim(goal.target_luna))
  const [deadline, setDeadline] = useState(goal.deadline)

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

  async function save() {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      let target_luna: string | undefined
      try {
        target_luna = nimToLuna(target)
      } catch (e) {
        setErr((e as Error).message)
        setBusy(false)
        return
      }
      await api.editGoal(goal.id, token, { title: title.trim(), story: story.trim(), target_luna, deadline })
      toast.push({ title: "Jar updated", body: "The receipts are untouched." })
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not save that"
      setErr(message)
      toast.push({ title: "Not saved", body: message, tone: "brick" })
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
        <button onClick={() => setEditing((v) => !v)} disabled={busy} className="chip text-[12px]">
          {editing ? "Cancel edit" : "Edit jar"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          <Field label="What are you saving for?" id="edit-title">
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} />
          </Field>
          <Field label="The line for your people" id="edit-story">
            <textarea
              id="edit-story"
              value={story}
              onChange={(e) => setStory(e.target.value.slice(0, 400))}
              rows={3}
              className="field resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target" hint="NIM" id="edit-target">
              <Input id="edit-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="Collect by" id="edit-deadline">
              <Input id="edit-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <Button onClick={save} disabled={busy || title.trim().length < 3}>
            Save changes
          </Button>
        </div>
      ) : null}

      {err ? <p className="mt-2 text-[12.5px] text-brick">{err}</p> : null}
    </Slip>
  )
}

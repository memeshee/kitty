"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api, ApiError, ownerKey } from "@/lib/api"
import { nimToLuna } from "@/lib/format"
import { Button, Field, inputClass } from "@/components/Bits"
import { OutsideNotice } from "@/components/OpenInPay"
import { useWallet } from "@/lib/useWallet"

function defaultDeadline(): string {
  const d = new Date(Date.now() + 30 * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function freshToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export default function NewJar() {
  const router = useRouter()
  const wallet = useWallet()
  const [title, setTitle] = useState("")
  const [target, setTarget] = useState("")
  const [story, setStory] = useState("")
  const [deadline, setDeadline] = useState(defaultDeadline())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDeadline(defaultDeadline()), [])

  const targetLuna = (() => {
    try {
      return nimToLuna(target || "0")
    } catch {
      return "0"
    }
  })()
  const ready = title.trim().length >= 3 && BigInt(targetLuna) >= 100_000n

  async function create() {
    setError(null)
    setBusy(true)
    try {
      let owner = wallet.address
      if (!owner) owner = await wallet.link()
      if (!owner) {
        setError(wallet.error ?? "Connect a Nimiq wallet first")
        setBusy(false)
        return
      }
      const token = freshToken()
      const { goal } = await api.createGoal({
        owner_address: owner,
        owner_token: token,
        title: title.trim(),
        story: story.trim(),
        target_luna: targetLuna,
        deadline,
      })
      window.localStorage.setItem(ownerKey(goal.id), token)
      router.push(`/g/${goal.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : ((e as Error)?.message ?? "Could not create the jar"))
      setBusy(false)
    }
  }

  return (
    <main>
      <a href="/" className="text-[13px] text-slate underline-offset-4 hover:underline">
        Kitty
      </a>
      <h1 className="mt-5 text-[30px] leading-tight font-medium tracking-tight text-ink">New jar</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate">
        The coins go to your own wallet. Kitty is only the receipts and the link.
      </p>

      <div className="mt-4">
        <OutsideNotice />
      </div>

      <div className={`mt-6 grid gap-5 ${wallet.inside === false ? "opacity-60" : ""}`}>
        <Field label="What are you saving for?">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Mai's school fees"
            className={inputClass}
          />
        </Field>

        <Field label="Target" hint="At least 1 NIM. You can go past it.">
          <div className="relative">
            <input
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="40000"
              className={`${inputClass} tnum pr-16`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-slate">NIM</span>
          </div>
        </Field>

        <Field label="Collect by">
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={`${inputClass} tnum`}
          />
        </Field>

        <Field label="A line for the people you will send this to" hint="Optional. Shown at the top of the jar.">
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value.slice(0, 400))}
            rows={3}
            placeholder="Two terms, one jar. Anything helps."
            className={inputClass}
          />
        </Field>

        {error ? <p className="text-[13px] text-brick">{error}</p> : null}

        <Button onClick={create} disabled={!ready || busy} className="w-full">
          {busy ? "Opening the jar" : "Create the jar"}
        </Button>
        {!ready ? (
          <p className="-mt-2 text-[12px] text-slate">A name of at least three characters and a target of 1 NIM or more.</p>
        ) : null}
      </div>
    </main>
  )
}

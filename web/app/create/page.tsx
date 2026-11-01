"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { api, ApiError, ownerKey } from "@/lib/api"
import { cn } from "@/lib/cn"
import { lunaToNim, nimToLuna } from "@/lib/format"
import { deeplink } from "@/lib/nimiq"
import { useWallet } from "@/lib/useWallet"
import { Button, Field, Input, Slip, Stepper } from "@/components/kit"
import { useToast } from "@/components/Toaster"

const STEPS = ["The thing", "The plan", "Review"] as const

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

function freshToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export default function CreatePage() {
  const router = useRouter()
  const wallet = useWallet()
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [title, setTitle] = useState("")
  const [story, setStory] = useState("")
  const [target, setTarget] = useState("20000")
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wallet.inside === null) return
  }, [wallet.inside])

  const targetLuna = useMemo(() => {
    try {
      return nimToLuna(target || "0")
    } catch {
      return "0"
    }
  }, [target])

  const titleOk = title.trim().length >= 3
  const targetOk = BigInt(targetLuna) >= 100_000n
  const canLeaveStep = step === 0 ? titleOk : step === 1 ? targetOk : true
  const deadline = isoInDays(days)

  async function create() {
    setError(null)
    setBusy(true)
    try {
      let owner = wallet.address
      if (!owner) owner = await wallet.link()
      if (!owner) {
        setError(wallet.error ?? "Link a Nimiq wallet first")
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
      toast.push({ title: "Jar opened", body: "Now send the link to your people." })
      router.push(`/g/${goal.id}`)
    } catch (e) {
      const message = e instanceof ApiError ? e.message : ((e as Error)?.message ?? "Could not create the jar")
      setError(message)
      toast.push({ title: "Not created", body: message, tone: "brick" })
      setBusy(false)
    }
  }

  return (
    <main className="pt-5">
      <p className="eyebrow">New jar</p>
      <h1 className="mt-2 text-[26px] leading-tight font-medium tracking-tight">Open a jar for one thing</h1>

      <ol className="mt-4 flex items-center gap-1.5" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex-1 rounded-full border-[1.5px] border-ink/25 px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint",
              i === step && "border-ink bg-amber font-bold text-ink",
              i < step && "border-ink/40 text-ink-soft",
            )}
          >
            {label}
          </li>
        ))}
      </ol>

      {wallet.inside === false ? (
        <div className="mt-4 slip p-4">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            A jar has to belong to a wallet, and wallets live in Nimiq Pay. Open Kitty there to create one.
          </p>
          <a href={deeplink("/create") ?? "#"} className="stamp-button mt-3 w-full" data-variant="amber">
            Open in Nimiq Pay
          </a>
        </div>
      ) : null}

      <Slip className="mt-4 p-4" press>
        {step === 0 ? (
          <div className="grid gap-4">
            <Field label="What are you saving for?" hint="The plainer the better. People give to a thing, not a cause." id="t">
              <Input
                id="t"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="Mai's school fees"
                autoFocus
              />
            </Field>
            <Field label="A line for the people you will send this to" hint="Optional, up to 400 characters." id="s">
              <textarea
                id="s"
                value={story}
                onChange={(e) => setStory(e.target.value.slice(0, 400))}
                rows={3}
                placeholder="Two terms, one jar. Anything helps. - Mai's mum"
                className="field resize-none"
              />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-5">
            <Field label="Target, in NIM" hint="At least 1 NIM. Going past it is fine." id="target">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="target"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
                  className="tnum w-[150px]"
                />
                <div className="flex gap-1.5">
                  {["1000", "5000", "20000", "100000"].map((preset) => (
                    <button key={preset} onClick={() => setTarget(preset)} className="chip text-[11.5px]">
                      {Number(preset).toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label="Collect by" hint={`${days} days · ${deadline}`} id="days">
              <div className="flex flex-wrap items-center gap-2">
                <Stepper value={days} min={7} max={365} step={7} onChange={setDays} suffix="days" label="days" />
                <div className="flex gap-1.5">
                  {[14, 30, 60, 90].map((d) => (
                    <button key={d} onClick={() => setDays(d)} className="chip text-[11.5px]">
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label="Or pick an exact date" id="date">
              <input
                id="date"
                type="date"
                value={deadline}
                onChange={(e) => {
                  const d = Math.max(1, Math.round((new Date(e.target.value).getTime() - Date.now()) / 86_400_000))
                  setDays(Math.min(365, d))
                }}
                className="field tnum"
              />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3">
            <div>
              <p className="eyebrow">The jar</p>
              <p className="mt-1.5 text-[20px] leading-tight font-medium">{title.trim() || "Untitled jar"}</p>
              {story.trim() ? <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{story.trim()}</p> : null}
            </div>
            <dl className="grid gap-2 border-t-[1.5px] border-dashed border-ink/25 pt-3 font-mono text-[12px]">
              <div className="flex items-baseline justify-between">
                <dt className="uppercase tracking-[0.1em] text-ink-faint">target</dt>
                <dd className="tnum">{lunaToNim(targetLuna)} NIM</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="uppercase tracking-[0.1em] text-ink-faint">collect by</dt>
                <dd className="tnum">{deadline}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="uppercase tracking-[0.1em] text-ink-faint">paid to</dt>
                <dd className="tnum truncate pl-3 text-right">{wallet.address ?? "your wallet"}</dd>
              </div>
            </dl>
            <p className="text-[12px] leading-relaxed text-ink-faint">
              Contributions go straight to that wallet, tagged with the jar&apos;s id. Kitty cannot move them, and
              cannot stop you spending them either.
            </p>
            {error ? (
              <p className="text-[12.5px] text-brick" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Slip>

      <div className="mt-4 flex items-center gap-2">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} className="chip">
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canLeaveStep} className="flex-1">
            {step === 0 ? "Next: the plan" : "Next: review"}
          </Button>
        ) : (
          <Button onClick={create} disabled={busy || !titleOk || !targetOk} className="flex-1">
            {busy ? "Opening the jar" : "Open the jar"}
          </Button>
        )}
      </div>

      {step === 0 && !titleOk ? (
        <p className="mt-2 text-[11.5px] text-ink-faint">A name of at least three characters, then you can continue.</p>
      ) : null}
      {step === 1 && !targetOk ? (
        <p className="mt-2 text-[11.5px] text-ink-faint">The target has to be at least 1 NIM.</p>
      ) : null}
    </main>
  )
}

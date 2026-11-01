"use client"

import { STEP_ORDER, nextStep } from "@/lib/nextStep"
import type { Goal, Contribution } from "@/lib/api"
import type { Pace } from "@/lib/pace"
import { cn } from "@/lib/cn"
import { Button } from "@/components/kit"

/** Exactly one instruction, derived from the jar's state and the viewer's role. */
export function NextStepCard({
  goal,
  pace,
  contributions,
  viewerAddress,
  isOwner,
  onPrimary,
}: {
  goal: Goal
  pace: Pace
  contributions: Contribution[]
  viewerAddress: string | null
  isOwner: boolean
  onPrimary?: () => void
}) {
  const step = nextStep({ goal, pace, viewerAddress, isOwner, contributions })

  return (
    <section aria-label="Next step" className="slip p-4">
      <p className="eyebrow">Next step</p>
      <p className="mt-1 text-[19px] leading-tight font-medium">{step.title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{step.body}</p>

      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Where this jar is">
        {STEP_ORDER.map((s) => (
          <li
            key={s.key}
            aria-current={s.key === step.key ? "step" : undefined}
            className={cn(
              "rounded-full border-[1.5px] border-ink/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint",
              s.key === step.key && "border-ink bg-amber font-bold text-ink",
            )}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {step.cta ? (
        <Button
          variant={step.key === "chipin" ? "ink" : "amber"}
          className="mt-3 w-full"
          onClick={() => {
            if (onPrimary) onPrimary()
            if (step.target) document.getElementById(step.target)?.scrollIntoView({ behavior: "smooth", block: "center" })
          }}
        >
          {step.cta}
        </Button>
      ) : null}
    </section>
  )
}

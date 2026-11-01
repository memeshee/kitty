"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/cn"

export type Toast = { id: number; title: string; body?: string; tone?: "ink" | "amber" | "brick" }

type Ctx = { push: (t: Omit<Toast, "id">) => void }

const ToastCtx = createContext<Ctx>({ push: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

/** Bottom-anchored slips. They sit above the sticky action bar and never block it. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random()
    setItems((cur) => [...cur.slice(-2), { ...t, id }])
  }, [])

  useEffect(() => {
    if (!items.length) return
    const timer = setTimeout(() => setItems((cur) => cur.slice(1)), 4200)
    return () => clearTimeout(timer)
  }, [items])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-50 mx-auto flex w-full max-w-[520px] flex-col gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-rise slip-press px-4 py-3",
              t.tone === "brick" && "border-brick",
            )}
          >
            <p className={cn("text-[13.5px] font-medium", t.tone === "brick" ? "text-brick" : "text-ink")}>{t.title}</p>
            {t.body ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{t.body}</p> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

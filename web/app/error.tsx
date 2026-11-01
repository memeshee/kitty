"use client"

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pt-16">
      <h1 className="text-[26px] font-medium tracking-tight text-ink">Something broke on our side</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate">
        Kitty never holds your money, so nothing is at risk. Try once more. If it keeps happening, every receipt is
        still on the Nimiq chain.
      </p>
      <button onClick={reset} className="mt-6 rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-paper">
        Try again
      </button>
    </main>
  )
}

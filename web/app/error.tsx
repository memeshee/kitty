"use client"

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pt-10">
      <div className="slip p-5">
        <p className="eyebrow">Something broke</p>
        <h1 className="mt-2 text-[24px] leading-tight font-medium">That was us, not you</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          Kitty never holds your money, so nothing is at risk. Try once more. If it keeps happening, every receipt is
          still on the Nimiq chain.
        </p>
        <button onClick={reset} className="stamp-button mt-5 w-full">
          Try again
        </button>
      </div>
    </main>
  )
}

import Link from "next/link"

export default function NotFound() {
  return (
    <main className="pt-10">
      <div className="slip p-5">
        <p className="eyebrow">404 · no jar here</p>
        <h1 className="mt-2 text-[24px] leading-tight font-medium">This link does not match a jar</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          If someone sent it to you, ask them to share it again from the app. Links are short and one character wrong
          is enough.
        </p>
        <Link href="/" className="stamp-button mt-5 w-full">
          Open Kitty
        </Link>
      </div>
    </main>
  )
}

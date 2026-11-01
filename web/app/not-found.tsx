export default function NotFound() {
  return (
    <main className="pt-16">
      <h1 className="text-[26px] font-medium tracking-tight text-ink">No jar here</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate">
        This link does not match a jar. If someone sent it to you, ask them to share it again from the app.
      </p>
      <a href="/" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-paper">
        Open Kitty
      </a>
    </main>
  )
}

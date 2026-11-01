import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { JetBrains_Mono } from "next/font/google"
import "./globals.css"

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" })

export const metadata: Metadata = {
  title: "Kitty: a jar your people fill",
  description:
    "Name what you are saving for, share the link, and let the people who care chip in. Every coin is a real NIM payment with a public receipt. Kitty never holds the money.",
  applicationName: "Kitty",
  openGraph: {
    title: "Kitty: a jar your people fill",
    description:
      "A goal jar inside Nimiq Pay. Every contribution is a real NIM payment with a public receipt.",
    type: "website",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f0e6",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] antialiased">
        <div className="mx-auto w-full max-w-[560px] px-5 pb-24 pt-5">{children}</div>
      </body>
    </html>
  )
}

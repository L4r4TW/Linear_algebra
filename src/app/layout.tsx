import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Linear Algebra Exercises",
  description:
    "Open source linear algebra exercises aligned with the Khan Academy linear algebra course.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">
              Linear Algebra
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/practice" className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                Practice
              </Link>
              <Link href="/profile" className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                Profile
              </Link>
              <Link href="/admin/exercises" className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                Admin
              </Link>
              <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                Login
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

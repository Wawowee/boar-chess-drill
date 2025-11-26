import './globals.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import AuthNav from '@/components/AuthNav'
import ThemeBoot from '@/components/ThemeBoot'
import AdminNav from '@/components/AdminNav'

export const metadata: Metadata = {
    title: 'Brute Chess',
    description: 'Free Opening Trainer || Study Openings Effectively',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen flex flex-col">
                <ThemeBoot />

                <header className="site-header sticky top-0 z-40 border-b border-black/5 shadow-sm">
                    <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/drill"
                            className="font-semibold text-3xl tracking-tight hover:opacity-85 transition logo-heading"
                        >
                            Brute Chess
                        </Link>

                        <nav className="flex items-center gap-4 text-base">
                            <Link
                                href="/drill"
                                className="inline-flex items-center rounded-full px-4 py-1.5
           bg-emerald-700 text-white shadow-sm border border-emerald-700
           hover:bg-emerald-600 hover:-translate-y-0.5 hover:shadow-md
           focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
           transition-transform transition-colors"
                            >
                                Drill
                            </Link>

                            <Link
                                href="/library"
                                className="hover:underline transition-transform hover:-translate-y-0.5"
                            >
                                Library
                            </Link>

                            {/* Admin-only links handled by client component */}
                            <AdminNav />

                            <Link
                                href="/stats"
                                className="hover:underline transition-transform hover:-translate-y-0.5"
                            >
                                Stats
                            </Link>
                            <Link
                                href="/blog"
                                className="hover:underline transition-transform hover:-translate-y-0.5"
                            >
                                Blog
                            </Link>

                            <AuthNav />
                        </nav>
                    </div>
                </header>

                <main className="flex-1 mx-auto max-w-5xl px-4 py-6 w-full">
                    {children}
                </main>

                {/* Global footer */}
                <footer className="border-t border-black/5 bg-white/80 relative z-50">
                    <div className="mx-auto max-w-5xl px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-gray-600">
                        {/* Left: links */}
                        <div className="flex flex-wrap items-center gap-4">
                            <Link
                                href="/tutorial"
                                className="hover:underline"
                            >
                                How Brute Chess Works
                            </Link>
                            <Link
                                href="/contact"
                                className="hover:underline"
                            >
                                Contact Information
                            </Link>
                        </div>

                        {/* Right: share icons */}
                        <div className="flex flex-col items-start md:items-end gap-2">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                                Share your progress:
                            </div>
                            <div className="flex gap-3">
                                {/* X / Twitter */}
                                <Link
                                    href="/share?platform=x"
                                    aria-label="Share on X"
                                    className="w-9 h-9 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-5 h-5 text-black"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M4 4L20 20M20 4L4 20"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </Link>

                                {/* Facebook */}
                                <Link
                                    href="/share?platform=facebook"
                                    aria-label="Share on Facebook"
                                    className="w-9 h-9 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-5 h-5 text-blue-600"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M13 4h3v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v7h-3v-7H8v-3h2V8c0-2.21 1.79-4 4-4z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </Link>

                                {/* Reddit */}
                                <Link
                                    href="/share?platform=reddit"
                                    aria-label="Share on Reddit"
                                    className="w-9 h-9 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-5 h-5 text-orange-500"
                                        aria-hidden="true"
                                    >
                                        <circle
                                            cx="12"
                                            cy="12"
                                            r="9"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                            fill="none"
                                        />
                                        <circle cx="9" cy="12" r="1.0" fill="currentColor" />
                                        <circle cx="15" cy="12" r="1.0" fill="currentColor" />
                                        <path
                                            d="M9 15c.7.7 1.8 1.1 3 1.1s2.3-.4 3-1.1"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                            strokeLinecap="round"
                                            fill="none"
                                        />
                                        <circle
                                            cx="17.5"
                                            cy="8.5"
                                            r="1.1"
                                            stroke="currentColor"
                                            strokeWidth={1.2}
                                            fill="none"
                                        />
                                        <path
                                            d="M14.5 8l1-3 3 1"
                                            stroke="currentColor"
                                            strokeWidth={1.2}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </Link>

                                {/* Instagram */}
                                <Link
                                    href="/share?platform=instagram"
                                    aria-label="Share on Instagram"
                                    className="w-9 h-9 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-5 h-5 text-pink-500"
                                        aria-hidden="true"
                                    >
                                        <rect
                                            x="4"
                                            y="4"
                                            width="16"
                                            height="16"
                                            rx="5"
                                            ry="5"
                                            stroke="currentColor"
                                            strokeWidth={1.6}
                                            fill="none"
                                        />
                                        <circle
                                            cx="12"
                                            cy="12"
                                            r="4"
                                            stroke="currentColor"
                                            strokeWidth={1.6}
                                            fill="none"
                                        />
                                        <circle
                                            cx="17"
                                            cy="7"
                                            r="1.2"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    </div>
                </footer>
            </body>
        </html>
    )
}

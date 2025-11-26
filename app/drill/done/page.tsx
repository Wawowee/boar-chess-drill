'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

export default function DrillDonePage() {
    const launchedRef = useRef(false)

    // Fire a short confetti sequence on mount
    useEffect(() => {
        if (launchedRef.current) return
        launchedRef.current = true
        runConfetti()
    }, [])

    async function runConfetti() {
        const confetti = (await import('canvas-confetti')).default

        // 1) Big opening burst
        confetti({
            particleCount: 120,
            spread: 70,
            startVelocity: 40,
            origin: { y: 0.6 },
            ticks: 200,
            colors: ['#22c55e', '#f97316', '#3b82f6', '#eab308'],
        })

        // 2) Two side cannons
        setTimeout(() => {
            confetti({
                particleCount: 80,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.6 },
            })
            confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.6 },
            })
        }, 180)
    }

    return (
        <div className="max-w-3xl mx-auto text-center space-y-12 py-10">
            {/* Heading */}
            <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-bold">
                    All done for today. ROAR!
                </h1>
                <p className="text-2xl text-gray-700">
                    You&apos;ve completed your daily opening training. Great work!
                </p>
            </div>

            {/* Main explanation text (no box) */}
            <div className="space-y-6 text-xl text-gray-800">
                <p>
                    If you would like to continue, you can go back to{' '}
                    <a
                        href="/drill"
                        className="font-semibold text-emerald-700 underline underline-offset-4 hover:no-underline"
                    >
                        drills
                    </a>{' '}
                    and edit the daily limit in the filters.
                </p>

                <p className="font-semibold">
                    To support us, please
                </p>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-6 justify-center">
                <a
                    href="/stats"
                    className="px-6 py-3 rounded-xl bg-emerald-600 text-white text-lg font-semibold shadow-md hover:bg-emerald-700 transition"
                >
                    View Your Overall Stats
                </a>
                <a
                    href="/blog"
                    className="px-6 py-3 rounded-xl border border-gray-300 bg-white text-lg font-semibold shadow-md hover:bg-gray-50 transition"
                >
                    Visit Our Blog
                </a>
            </div>

            {/* Social share area */}
            <div className="pt-6 border-t border-gray-200 space-y-4">
                <div className="text-lg font-semibold text-gray-800">
                    Share your progress:
                </div>

                <div className="flex flex-wrap gap-4 justify-center text-lg">
                    {/* X / Twitter */}
                    <Link
                        href="/share?platform=x"
                        aria-label="Share on X"
                        className="w-14 h-14 rounded-full border border-gray-300 bg-white shadow-md flex items-center justify-center hover:bg-gray-50"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7 text-black"
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
                        className="w-14 h-14 rounded-full border border-gray-300 bg-white shadow-md flex items-center justify-center hover:bg-gray-50"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7 text-blue-600"
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
                        className="w-14 h-14 rounded-full border border-gray-300 bg-white shadow-md flex items-center justify-center hover:bg-gray-50"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7 text-orange-500"
                            aria-hidden="true"
                        >
                            {/* outer circle */}
                            <circle
                                cx="12"
                                cy="12"
                                r="9"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                fill="none"
                            />
                            {/* eyes */}
                            <circle cx="9" cy="12" r="1.2" fill="currentColor" />
                            <circle cx="15" cy="12" r="1.2" fill="currentColor" />
                            {/* smile */}
                            <path
                                d="M9 15c.7.7 1.8 1.1 3 1.1s2.3-.4 3-1.1"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                fill="none"
                            />
                            {/* antenna */}
                            <circle
                                cx="17.5"
                                cy="8.5"
                                r="1.2"
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
                        className="w-14 h-14 rounded-full border border-gray-300 bg-white shadow-md flex items-center justify-center hover:bg-gray-50"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7 text-pink-500"
                            aria-hidden="true"
                        >
                            {/* rounded square */}
                            <rect
                                x="4"
                                y="4"
                                width="16"
                                height="16"
                                rx="5"
                                ry="5"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                fill="none"
                            />
                            {/* inner circle */}
                            <circle
                                cx="12"
                                cy="12"
                                r="4"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                fill="none"
                            />
                            {/* small top-right dot */}
                            <circle
                                cx="17"
                                cy="7"
                                r="1.4"
                                fill="currentColor"
                            />
                        </svg>
                    </Link>
                </div>
            </div>
        </div>
    )
}

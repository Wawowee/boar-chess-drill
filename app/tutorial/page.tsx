'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'

type SectionKey = 'getting-started' | 'deck' | 'example' | 'updates'

const SECTIONS: { key: SectionKey; title: string }[] = [
    { key: 'getting-started', title: 'Getting started' },
    { key: 'deck', title: 'The Brute Force Opening Deck' },
    { key: 'example', title: 'Example Tutorial' },
    { key: 'updates', title: 'Brute Updates' },
]

// Slides for "Getting started"
const GETTING_STARTED_SLIDES: string[] = [
    `Welcome to Brute Chess Opening Trainer! Our mission is to provide free opening training using engaging and effective learning methods. As you progress through our opening repertoire, you will gain knowledge that would bring you to an early advantage in a game.`,
    `The main tool implemented here is spaced repetition: Each day, you will be assigned a set of openings to complete. When you learn a new opening and move on, the opening is not gone forever. Instead, the opening will appear again after a period of time, and the length of this period will increase each time you see it.`,
    `The training here is very rigorous and tedious; this reality cannot be denied. The first 145 lines are all for the Sicilian Opening, and after that, you can expect to spend several days on the English Opening. Completing this training will expose and prepare you for almost all openings played by 2500+ players. The level that the Brute Chess Opening Repertoire will benefit most is from beginning to intermediate (up to at least 2000 elo), although this is a very subjective number, as it could solidify opening knowledge for higher ratings that lack strong opening fundamentals as well. The only expectation we have for using this tool is that you are familiar with the movement of chess pieces.`,
    `While the biggest strength of this trainer is memorization and solidifying your opening repertoire, you will also be directed to resources that will supplement your learning. It is important to understand the position and strategies of each opening, so viewing some of the resources will be necessary for a comprehensive understanding. Especially as you proceed, we do not believe you will have to view the resources for every opening, as many structures and strategic ideas that come from these openings will be similar. However, if you would like to understand the openings more in depth, the option will always be there.`,
    `To start, please create your free account so you can save your progress.`,
]

// Slides for "The Brute Force Opening Deck"
const DECK_SLIDES: (JSX.Element | string)[] = [
    `Through our computer analysis of 10 million games played by 2500+ rated players between 2021 - 2025, we have compiled the top 1000 most frequently played named openings. 95% of these games use one of these 1000 openings! While the name of our deck is called the 1000 opening challenge, you will soon notice there are 2000 openings in the deck in total, because we believe it is equally important to experience the openings from both black and white. In each of these 1000 openings, we have extended the opening sequence to include the most frequently played moves after the main line as it is still essential to learn what the opening offers. More on specifically how our sorting algorithm works will be posted soon.`,
    (
        <div className="flex items-center justify-center h-full">
            <a
                href="/tutorial/top_openings_by_name.csv"
                download
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border shadow-sm bg-white hover:bg-gray-50 text-sm font-semibold"
            >
                Download opening list (CSV)
            </a>
        </div>
    ),
]

// Slides for "Example Tutorial" (one sentence + image per slide)
const EXAMPLE_SLIDES: { text: string; img: string }[] = [
    {
        text: 'Side bar shows opening to complete.',
        img: '/tutorial/tutorialpic1.jpg',
    },
    {
        text: 'Drag or click to move the pieces.',
        img: '/tutorial/tutorialpic2.jpg',
    },
    {
        text:
            'When you complete an opening or finish reviewing an opening, click anywhere outside of the board or side panel to continue to the next opening.',
        img: '/tutorial/tutorialpic3.jpg',
    },
    {
        text:
            'If the opening is new to you or you do not know it, click Show Solution and study the opening',
        img: '/tutorial/tutorialpic4.jpg',
    },
    {
        text:
            'Clicking Show Solution or making a mistake will lead the opening to show up again after 7 minutes.',
        img: '/tutorial/tutorialpic5.jpg',
    },
    {
        text:
            'If you do not want to see the opening again, click the trash icon to remove the opening permanently.',
        img: '/tutorial/tutorialpic8.jpg',
    },
    {
        text: 'Click the icon to view daily Stats',
        img: '/tutorial/tutorialpic6.jpg',
    },
    {
        text: 'Click Filter to view the options for customizing your training.',
        img: '/tutorial/tutorialpic7.jpg',
    },
]

// Single-slide content for "Brute Updates"
const UPDATES_SLIDES: JSX.Element[] = [
    <div className="space-y-3" key="updates-0">
        <p className="text-gray-800 text-[1.0625rem] md:text-lg leading-relaxed tracking-[0.01em] antialiased">
            What we are currently working on:
        </p>
        <ul className="list-disc pl-5 text-gray-800 text-[1.0625rem] md:text-lg leading-relaxed tracking-[0.01em] antialiased">
            <li>Improved resources for each opening</li>
            <li>Study decks for opening traps</li>
            <li>Option to create own deck by PGN import</li>
        </ul>
    </div>,
]



export default function BruteTutorialPage() {
    const [active, setActive] = useState<SectionKey>('getting-started')

    // Getting started slides
    const [gsIdx, setGsIdx] = useState(0)
    const canPrev = gsIdx > 0
    const canNext = gsIdx < GETTING_STARTED_SLIDES.length - 1
    const goPrev = useCallback(() => { if (canPrev) setGsIdx(i => i - 1) }, [canPrev])
    const goNext = useCallback(() => { if (canNext) setGsIdx(i => i + 1) }, [canNext])

    // Deck slides (independent index)
    const [deckIdx, setDeckIdx] = useState(0)
    const deckCanPrev = deckIdx > 0
    const deckCanNext = deckIdx < DECK_SLIDES.length - 1
    const deckPrev = useCallback(() => { if (deckCanPrev) setDeckIdx(i => i - 1) }, [deckCanPrev])
    const deckNext = useCallback(() => { if (deckCanNext) setDeckIdx(i => i + 1) }, [deckCanNext])
    // Example slides state
    const [exIdx, setExIdx] = useState(0)
    const exCanPrev = exIdx > 0
    const exCanNext = exIdx < EXAMPLE_SLIDES.length - 1
    const exPrev = useCallback(() => { if (exCanPrev) setExIdx(i => i - 1) }, [exCanPrev])
    const exNext = useCallback(() => { if (exCanNext) setExIdx(i => i + 1) }, [exCanNext])


    // Honor hash on load
    useEffect(() => {
        const raw = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) as SectionKey
        if (raw && SECTIONS.some(s => s.key === raw)) {
            setActive(raw)
            if (raw === 'getting-started') setGsIdx(0)
            if (raw === 'deck') setDeckIdx(0)
            if (raw === 'example') setExIdx(0) // NEW
        }
    }, [])


    // Sync hash with section
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.hash = active
            window.history.replaceState(null, '', url.toString())
        }
    }, [active])

    // Keyboard nav per section
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (active === 'getting-started') {
                if (e.key === 'ArrowRight' && canNext) setGsIdx(i => i + 1)
                if (e.key === 'ArrowLeft' && canPrev) setGsIdx(i => i - 1)
            } else if (active === 'deck') {
                if (e.key === 'ArrowRight' && deckCanNext) setDeckIdx(i => i + 1)
                if (e.key === 'ArrowLeft' && deckCanPrev) setDeckIdx(i => i - 1)
            } else if (active === 'example') {             // NEW
                if (e.key === 'ArrowRight' && exCanNext) setExIdx(i => i + 1)
                if (e.key === 'ArrowLeft' && exCanPrev) setExIdx(i => i - 1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [active, canNext, canPrev, deckCanNext, deckCanPrev, exCanNext, exCanPrev])


    const content = useMemo(() => {
        const SlideShell = ({
            children,
            footer,
            dots,
            heightClass = 'h-72 md:h-80 lg:h-96', // default height
        }: {
            children: React.ReactNode
            footer: React.ReactNode
            dots: React.ReactNode
            heightClass?: string
        }) => (
            <div className="space-y-3">
                <div className={`relative rounded-lg border border-black/10 bg-white/80 p-4
                     flex flex-col ${heightClass}`}>
                    <div className="flex-1 overflow-y-auto pr-1">
                        {children}
                    </div>
                    <div className="mt-4">{footer}</div>
                    <div className="mt-3">{dots}</div>
                </div>
                <div className="flex justify-end">
                    <Link
                        href="/drill"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700
                  text-white font-semibold shadow-sm text-sm transition"
                    >
                        Get Started!
                    </Link>
                </div>
            </div>
        )


        switch (active) {
            case 'getting-started':
                return (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">Getting started</h2>
                        <SlideShell
                            children={
                                <p className="text-gray-800 text-[1.0625rem] md:text-lg leading-relaxed tracking-[0.01em] antialiased">
                                    {GETTING_STARTED_SLIDES[gsIdx]}
                                </p>
                            }
                            footer={
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={goPrev}
                                        disabled={!canPrev}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                      ${canPrev ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={goNext}
                                        disabled={!canNext}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                      ${canNext ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        Next →
                                    </button>
                                </div>
                            }
                            dots={
                                <div className="flex items-center justify-center gap-2">
                                    {GETTING_STARTED_SLIDES.map((_, i) => (
                                        <button
                                            key={i}
                                            aria-label={`Go to slide ${i + 1}`}
                                            onClick={() => setGsIdx(i)}
                                            className={`h-2 w-2 rounded-full transition
                        ${i === gsIdx ? 'bg-gray-800' : 'bg-gray-300 hover:bg-gray-400'}`}
                                        />
                                    ))}
                                </div>
                            }
                        />
                    </div>
                )

            case 'deck':
                return (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">The Brute Force Opening Deck</h2>
                        <SlideShell
                            children={
                                typeof DECK_SLIDES[deckIdx] === 'string' ? (
                                    <p className="text-gray-800 text-[1.0625rem] md:text-lg leading-relaxed tracking-[0.01em] antialiased">
                                        {DECK_SLIDES[deckIdx] as string}
                                    </p>
                                ) : (
                                    DECK_SLIDES[deckIdx] as JSX.Element
                                )
                            }
                            footer={
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={deckPrev}
                                        disabled={!deckCanPrev}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                      ${deckCanPrev ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={deckNext}
                                        disabled={!deckCanNext}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                      ${deckCanNext ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        Next →
                                    </button>
                                </div>
                            }
                            dots={
                                <div className="flex items-center justify-center gap-2">
                                    {DECK_SLIDES.map((_, i) => (
                                        <button
                                            key={i}
                                            aria-label={`Go to slide ${i + 1}`}
                                            onClick={() => setDeckIdx(i)}
                                            className={`h-2 w-2 rounded-full transition
                        ${i === deckIdx ? 'bg-gray-800' : 'bg-gray-300 hover:bg-gray-400'}`}
                                        />
                                    ))}
                                </div>
                            }
                        />
                    </div>
                )

            case 'example':
                return (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">Example Tutorial</h2>

                        <SlideShell
                            heightClass="h-[28rem] md:h-[34rem] lg:h-[38rem]"  // taller, avoids scroll
                            children={
                                <div className="space-y-3">
                                    <p className="text-gray-800 text-[1.0625rem] md:text-lg leading-relaxed tracking-[0.01em] antialiased">
                                        {EXAMPLE_SLIDES[exIdx].text}
                                    </p>
                                    <img
                                        src={EXAMPLE_SLIDES[exIdx].img}
                                        alt="Brute Chess tutorial"
                                        className="w-full max-h-[22rem] md:max-h-[28rem] lg:max-h-[32rem]
                         object-contain rounded-md border border-black/10 bg-white"
                                    />
                                </div>
                            }
                            footer={
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={exPrev}
                                        disabled={!exCanPrev}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                          ${exCanPrev ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={exNext}
                                        disabled={!exCanNext}
                                        className={`px-3 py-1.5 rounded-lg border text-sm transition
                          ${exCanNext ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        Next →
                                    </button>
                                </div>
                            }
                            dots={
                                <div className="flex items-center justify-center gap-2">
                                    {EXAMPLE_SLIDES.map((_, i) => (
                                        <button
                                            key={i}
                                            aria-label={`Go to slide ${i + 1}`}
                                            onClick={() => setExIdx(i)}
                                            className={`h-2 w-2 rounded-full transition
                            ${i === exIdx ? 'bg-gray-800' : 'bg-gray-300 hover:bg-gray-400'}`}
                                        />
                                    ))}
                                </div>
                            }
                        />
                    </div>
                )



            case 'updates':
                return (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">Brute Updates</h2>

                        <SlideShell
                            // You can bump height if you want a taller stage:
                            // heightClass="h-80 md:h-[22rem] lg:h-[26rem]"
                            children={UPDATES_SLIDES[0]}
                            footer={
                                <div className="flex items-center justify-between">
                                    <button
                                        disabled
                                        className="px-3 py-1.5 rounded-lg border text-sm opacity-50 cursor-not-allowed"
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        disabled
                                        className="px-3 py-1.5 rounded-lg border text-sm opacity-50 cursor-not-allowed"
                                    >
                                        Next →
                                    </button>
                                </div>
                            }
                            dots={
                                <div className="flex items-center justify-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-gray-800" />
                                </div>
                            }
                        />
                    </div>
                )

        }
    }, [active, gsIdx, canPrev, canNext, goPrev, goNext, deckIdx, deckCanPrev, deckCanNext, deckPrev, deckNext, exIdx, exCanPrev, exCanNext, exPrev, exNext])

    return (
        <div className="relative">
            {/* Full-screen background image */}
            <div
                className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/tutorial/background_tut2.jpg')" }}
            />
        <div className="p-4">
                <div className="mb-4 flex items-center justify-between">
                    <h1 className="text-2xl md:text-3xl font-semibold text-white">
                        How Brute Chess Works
                    </h1>
                    <Link
                        href="/blog"
                        className="text-sm px-3 py-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition"
                    >
                        ← Back to Blog
                    </Link>
                </div>


            <div className="grid grid-cols-12 gap-6">
                {/* TOC */}
                <nav className="col-span-12 lg:col-span-3">
                    <div className="sticky top-20 space-y-2">
                        {SECTIONS.map(s => {
                            const selected = s.key === active
                            return (
                                <button
                                    key={s.key}
                                    onClick={() => {
                                        setActive(s.key)
                                        if (s.key === 'getting-started') setGsIdx(0)
                                        if (s.key === 'deck') setDeckIdx(0)
                                        if (s.key === 'example') setExIdx(0)   // NEW
                                    }}

                                    className={`w-full text-left px-3 py-2 rounded-lg border transition
        ${selected
                                            ? 'bg-white shadow-sm border-black/10'
                                            : 'bg-white shadow-sm border-black/10 hover:bg-gray-50'}`}
                                >
                                    <div
                                        className={`text-sm ${selected ? 'font-semibold text-gray-900' : 'text-gray-800'}`}
                                    >
                                        {s.title}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </nav>

                {/* Section content container (slightly darker than white) */}
                <section className="col-span-12 lg:col-span-9">
                    <div className="rounded-xl bg-neutral-50 ring-1 ring-black/5 p-5 shadow-sm">
                        {content}
                    </div>
                </section>
            </div>
            </div>
        </div>
    )
}

'use client'

import Protected from '@/app/protected'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

/** ---- Types (aligned with Stats page) ---- */
type EventRow = { line_id: string; result: 'pass' | 'fail'; seen_at: string }
type ReviewRow = {
    line_id: string
    last_result: 'pass' | 'fail' | null
    last_seen_at: string | null
    interval_days: number | null
    due_on: string | null
    status?: string | null
}
type LineWithSide = {
    id: string
    is_active: boolean
    line_name: string | null
    openings: {
        side: 'white' | 'black' | 'both'
        name: string | null
        deck_id?: string | null
    } | null
}

/** ---- Helpers copied from Stats page so values match ---- */
const USER_TZ =
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
const DAY_MS = 24 * 60 * 60 * 1000

function dayString3am(d: Date) {
    const copy = new Date(d)
    copy.setHours(copy.getHours() - 3)
    return copy.toLocaleDateString('en-CA', { timeZone: USER_TZ })
}
function localDay3am(offsetDays = 0): string {
    const d = new Date()
    d.setHours(d.getHours() - 3)
    d.setDate(d.getDate() + offsetDays)
    return d.toLocaleDateString('en-CA', { timeZone: USER_TZ })
}
function iso3am(day: string) {
    return `${day}T03:00:00`
}

function computeAccuracyFromEvents(rows: EventRow[], fromDay?: string, thruDay?: string) {
    const byDayLine = new Map<string, { hadFail: boolean }>()
    for (const r of rows ?? []) {
        const localDay = dayString3am(new Date(r.seen_at))
        if (fromDay && localDay < fromDay) continue
        if (thruDay && localDay > thruDay) continue
        const key = `${localDay}|${r.line_id}`
        const cur = byDayLine.get(key) ?? { hadFail: false }
        if (r.result === 'fail') cur.hadFail = true
        byDayLine.set(key, cur)
    }
    const total = byDayLine.size
    const clean = [...byDayLine.values()].filter(v => !v.hadFail).length
    const pct = total ? Math.round((clean / total) * 1000) / 10 : 100
    return { clean, total, pct }
}
function computeLongestPassStreak(events: EventRow[]) {
    const days = new Set<string>()
    for (const ev of events ?? []) {
        if (ev.result !== 'pass') continue
        days.add(dayString3am(new Date(ev.seen_at)))
    }
    if (days.size === 0) return 0
    const arr = Array.from(days).sort()
    let longest = 1, cur = 1
    const toMidnight = (s: string) => {
        const [y, m, d] = s.split('-').map(Number)
        return new Date(y, m - 1, d).getTime()
    }
    for (let i = 1; i < arr.length; i++) {
        if (toMidnight(arr[i]) - toMidnight(arr[i - 1]) === DAY_MS) cur += 1
        else { longest = Math.max(longest, cur); cur = 1 }
    }
    return Math.max(longest, cur)
}

function computeLongestCorrectStreak(events: EventRow[]) {
    const sorted = [...(events ?? [])].sort(
        (a, b) => new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
    )
    let cur = 0, longest = 0
    for (const e of sorted) {
        if (e.result === 'pass') { cur += 1; longest = Math.max(longest, cur) }
        else { cur = 0 }
    }
    return longest
}

function computeCurrentCorrectStreakRecurringByHistory(events: EventRow[] | null) {
    if (!events) return 0

    const today = localDay3am(0)
    const todayIso = iso3am(today)
    const tomorrowIso = iso3am(localDay3am(1))

    const hadPrior = new Set<string>()
    for (const e of events) {
        if (e.seen_at < todayIso) hadPrior.add(e.line_id)
    }

    const todaysEligible = events
        .filter(e => e.seen_at >= todayIso && e.seen_at < tomorrowIso && hadPrior.has(e.line_id))
        .sort((a, b) => new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime())

    let cur = 0
    for (let i = todaysEligible.length - 1; i >= 0; i--) {
        if (todaysEligible[i].result === 'pass') cur++
        else break
    }
    return cur
}

/** time-on-Drill from localStorage (same keys as Stats) */
function readSecondsForDay(uid: string | null, day: string) {
    try { return Number(localStorage.getItem(`bc_time_spent:${uid ?? 'anon'}:${day}`) ?? '0') || 0 }
    catch { return 0 }
}
function readSeconds7d(uid: string | null) {
    let total = 0
    for (let i = 0; i < 7; i++) total += readSecondsForDay(uid, localDay3am(-i))
    return total
}
function readSecondsAllTime(uid: string | null) {
    try {
        let sum = 0
        const prefix = `bc_time_spent:${uid ?? 'anon'}:`
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)!
            if (k.startsWith(prefix)) sum += Number(localStorage.getItem(k) ?? '0') || 0
        }
        return sum
    } catch { return 0 }
}
function fmtMinutes(totalSec: number) {
    const m = Math.round(totalSec / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
}

/** ---- share page ---- */

type Platform = 'x' | 'facebook' | 'reddit' | 'instagram' | 'generic'

function platformLabel(p: Platform) {
    switch (p) {
        case 'x': return 'X (Twitter)'
        case 'facebook': return 'Facebook'
        case 'reddit': return 'Reddit'
        case 'instagram': return 'Instagram'
        default: return 'Social Media'
    }
}

/** Poster templates */
const posterTemplates = [
    { id: 'dark' as const, name: 'Dark board' },
    { id: 'emerald' as const, name: 'Emerald burst' },
    { id: 'light' as const, name: 'Midnight teal' },
    { id: 'minimal' as const, name: 'Minimal' },
]
type TemplateId = (typeof posterTemplates)[number]['id']

function getTemplateStyles(templateId: TemplateId) {
    switch (templateId) {
        case 'emerald':
            return {
                container:
                    'bg-gradient-to-br from-emerald-900 via-emerald-700 to-lime-500 text-emerald-50',
                glyphOpacity: 'opacity-10',
                statCard: 'bg-black/10',
            }
        case 'light':
            return {
                container:
                    'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-800 text-emerald-50',
                glyphOpacity: 'opacity-20',
                statCard: 'bg-black/25 border border-emerald-400/60',
            }
        case 'minimal':
            return {
                container: 'bg-slate-900 text-white',
                glyphOpacity: 'opacity-10',
                statCard: 'bg-slate-800/80',
            }
        case 'dark':
        default:
            return {
                container:
                    'bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-700 text-white',
                glyphOpacity: 'opacity-15',
                statCard: 'bg-white/10',
            }
    }
}

function hashtags(p: Platform) {
    let tags = '#BruteChess #chess'
    if (p === 'x') tags += ' #ChessTwitter'
    if (p === 'facebook') tags += ' #chessstudy'
    if (p === 'reddit') tags += ' #chess'
    if (p === 'instagram') tags += ' #chesslife'
    return tags
}

function buildPostText(p: Platform, stats: { label: string; value: string }[]) {
    const title = 'My Brute Chess progress'
    const lines: string[] = []
    lines.push(title)

    if (stats.length) {
        for (const s of stats) {
            lines.push(`• ${s.label}: ${s.value}`)
        }
    }

    lines.push('')
    lines.push(hashtags(p))

    return lines.join('\n')
}

export default function ShareClient() {
    const searchParams = useSearchParams()
    const platformParam = (searchParams.get('platform') ?? 'generic') as Platform

    const posterRef = useRef<HTMLDivElement | null>(null)

    const [rows, setRows] = useState<ReviewRow[] | null>(null)
    const [events, setEvents] = useState<EventRow[] | null>(null)
    const [lines, setLines] = useState<LineWithSide[] | null>(null)
    const [uid, setUid] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedIds, setSelectedIds] = useState<string[]>([
        'studiedToday',
        'accuracy7',
        'time7d',
    ])
    const [templateId, setTemplateId] = useState<TemplateId>('dark')

    const templateStyles = useMemo(
        () => getTemplateStyles(templateId),
        [templateId]
    )

    async function handleDownloadPoster() {
        if (!posterRef.current) return

        try {
            const htmlToImage = await import('html-to-image')
            const dataUrl = await htmlToImage.toPng(posterRef.current, {
                pixelRatio: 2,
            })

            const link = document.createElement('a')
            link.href = dataUrl
            link.download = 'brute-chess-progress.png'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (err) {
            console.error('Failed to export image', err)
            alert('Sorry, something went wrong exporting the poster.')
        }
    }

    // load DB data (all decks, same as Stats but simpler)
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const { data: auth } = await supabase.auth.getUser()
            const myUid = auth.user?.id
            setUid(myUid ?? null)
            if (!myUid) {
                if (!cancelled) setLoading(false)
                return
            }

            const [
                { data: reviewData, error: revErr },
                { data: ev, error: evErr },
                { data: ls, error: lsErr },
            ] = await Promise.all([
                supabase
                    .from('reviews')
                    .select('line_id,last_result,last_seen_at,interval_days,due_on,status')
                    .eq('user_id', myUid),
                supabase
                    .from('review_events')
                    .select('line_id,result,seen_at')
                    .eq('user_id', myUid),
                supabase
                    .from('lines')
                    .select('id,is_active,line_name,openings(name,side,deck_id)'),
            ])

            if (cancelled) return

            if (!revErr) setRows((reviewData ?? []) as ReviewRow[])
            if (!evErr) setEvents((ev ?? []) as EventRow[])
            if (!lsErr) setLines((ls ?? []) as LineWithSide[])

            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [])

    /** derived stats (mirroring Stats page, all decks) */
    const todayLocal = useMemo(() => localDay3am(0), [])
    const linesFiltered = lines
    const rowsFiltered = rows
    const eventsFiltered = events

    const studiedToday = useMemo(() => {
        if (!rowsFiltered) return 0
        return rowsFiltered.filter(
            r => r.last_seen_at && dayString3am(new Date(r.last_seen_at)) === todayLocal
        ).length
    }, [rowsFiltered, todayLocal])

    const dueToday = useMemo(() => {
        if (!rowsFiltered) return 0
        return rowsFiltered.filter(
            r => r.due_on && r.due_on <= todayLocal && (r.status ?? '') !== 'removed'
        ).length
    }, [rowsFiltered, todayLocal])

    const accuracyAll = useMemo(() => {
        if (!eventsFiltered) return { clean: 0, total: 0, pct: 100 }
        return computeAccuracyFromEvents(eventsFiltered)
    }, [eventsFiltered])

    const accuracy7 = useMemo(() => {
        if (!eventsFiltered) return { clean: 0, total: 0, pct: 100 }
        const start = new Date()
        start.setDate(start.getDate() - 6)
        return computeAccuracyFromEvents(eventsFiltered, dayString3am(start))
    }, [eventsFiltered])

    const longestDayStreak = useMemo(
        () => computeLongestPassStreak(eventsFiltered ?? []),
        [eventsFiltered]
    )

    const longestCorrectOpeningStreak = useMemo(
        () => computeLongestCorrectStreak(eventsFiltered ?? []),
        [eventsFiltered]
    )
    const currentCorrectOpeningStreak = useMemo(
        () => computeCurrentCorrectStreakRecurringByHistory(eventsFiltered ?? []),
        [eventsFiltered]
    )

    const linesTotal = useMemo(
        () => (linesFiltered ?? []).filter(l => l.is_active).length,
        [linesFiltered]
    )

    const newRemaining = useMemo(() => {
        if (!rowsFiltered || !linesFiltered) return 0
        const activeIds = new Set(
            (linesFiltered ?? []).filter(l => l.is_active).map(l => l.id)
        )
        const myIds = new Set((rowsFiltered ?? []).map(r => r.line_id))
        let remain = 0
        for (const id of activeIds) if (!myIds.has(id)) remain++
        return remain
    }, [rowsFiltered, linesFiltered])

    const totalCompleted = useMemo(
        () => Math.max(0, linesTotal - newRemaining),
        [linesTotal, newRemaining]
    )

    const timeTodayMin = useMemo(
        () => Math.round(readSecondsForDay(uid, todayLocal) / 60),
        [uid, todayLocal]
    )
    const time7dMin = useMemo(
        () => Math.round(readSeconds7d(uid) / 60),
        [uid]
    )
    const timeTotalMin = useMemo(
        () => Math.round(readSecondsAllTime(uid) / 60),
        [uid]
    )

    const perSideAcc7d = useMemo(() => {
        if (!eventsFiltered || !linesFiltered) return { white: 100, black: 100 }
        const start7 = localDay3am(-6)
        const dayLineHadFail = new Map<string, boolean>()
        ;(eventsFiltered ?? []).forEach(e => {
            const d = dayString3am(new Date(e.seen_at))
            if (d < start7) return
            const k = `${d}|${e.line_id}`
            dayLineHadFail.set(k, (dayLineHadFail.get(k) ?? false) || e.result === 'fail')
        })
        let wTot = 0, wClean = 0, bTot = 0, bClean = 0
        const index = new Map((linesFiltered ?? []).map(l => [l.id, l]))
        dayLineHadFail.forEach((hadFail, key) => {
            const lineId = key.split('|')[1]
            const side = index.get(lineId)?.openings?.side
            if (side === 'white') { wTot++; if (!hadFail) wClean++ }
            else if (side === 'black') { bTot++; if (!hadFail) bClean++ }
        })
        return {
            white: wTot ? Math.round((wClean / wTot) * 1000) / 10 : 100,
            black: bTot ? Math.round((bClean / bTot) * 1000) / 10 : 100,
        }
    }, [eventsFiltered, linesFiltered])

    const openingsMastered = useMemo(() => {
        if (!rowsFiltered || !linesFiltered || !eventsFiltered) return 0
        const thirtyAgo = localDay3am(-30)
        const failedRecently = new Set(
            eventsFiltered
                .filter(
                    e => e.result === 'fail' &&
                        dayString3am(new Date(e.seen_at)) >= thirtyAgo
                )
                .map(e => e.line_id)
        )
        const byId = new Map(rowsFiltered.map(r => [r.line_id, r]))
        const activeIds = new Set(
            (linesFiltered ?? []).filter(l => l.is_active).map(l => l.id)
        )
        let mastered = 0
        for (const id of activeIds) {
            const rr = byId.get(id)
            if (!rr) continue
            if ((rr.status ?? '') === 'removed') continue
            const interval = rr.interval_days ?? 0
            if (interval < 20) continue
            if (failedRecently.has(id)) continue
            mastered += 1
        }
        return mastered
    }, [rowsFiltered, linesFiltered, eventsFiltered])

    const dueTomorrowRecurring = useMemo(() => {
        if (!rowsFiltered) return 0
        const tomorrow = localDay3am(1)
        return rowsFiltered.filter(
            r =>
                r.due_on === tomorrow &&
                ['learning', 'review'].includes(r.status ?? '')
        ).length
    }, [rowsFiltered])

    /** list of shareable stats (matching Stats page labels) */
    const statOptions = useMemo(() => {
        return [
            {
                id: 'studiedToday',
                label: 'Studied Today',
                value: `${studiedToday} openings`,
            },
            {
                id: 'dueToday',
                label: 'Due Today',
                value: `${dueToday} openings`,
            },
            {
                id: 'totalCompleted',
                label: 'Total Completed',
                value: `${totalCompleted} openings`,
            },
            {
                id: 'totalRemaining',
                label: 'Total Remaining',
                value: `${newRemaining} openings`,
            },
            {
                id: 'accuracyAll',
                label: 'Accuracy (All-time)',
                value: `${accuracyAll.pct.toFixed(1)}% (${accuracyAll.clean}/${accuracyAll.total})`,
            },
            {
                id: 'accuracy7',
                label: 'Accuracy (Last 7 days)',
                value: `${accuracy7.pct.toFixed(1)}% (${accuracy7.clean}/${accuracy7.total})`,
            },
            {
                id: 'longestDayStreak',
                label: 'Longest Day Streak',
                value: `${longestDayStreak} day(s)`,
            },
            {
                id: 'longestCorrectOpeningStreak',
                label: 'Longest Correct Opening Streak',
                value: `${longestCorrectOpeningStreak} in a row`,
            },
            {
                id: 'currentCorrectOpeningStreak',
                label: 'Current Correct Opening Streak',
                value: `${currentCorrectOpeningStreak} in a row today`,
            },
            {
                id: 'timeToday',
                label: 'Time Spent Today',
                value: fmtMinutes(timeTodayMin * 60),
            },
            {
                id: 'time7d',
                label: 'Time Spent (Last 7 days)',
                value: fmtMinutes(time7dMin * 60),
            },
            {
                id: 'timeTotal',
                label: 'Total Time Spent',
                value: fmtMinutes(timeTotalMin * 60),
            },
            {
                id: 'whiteAcc7',
                label: 'White Accuracy (Last 7 days)',
                value: `${perSideAcc7d.white.toFixed(1)}%`,
            },
            {
                id: 'blackAcc7',
                label: 'Black Accuracy (Last 7 days)',
                value: `${perSideAcc7d.black.toFixed(1)}%`,
            },
            {
                id: 'openingsMastered',
                label: 'Openings Mastered',
                value: `${openingsMastered}`,
            },
            {
                id: 'dueTomorrowRecurring',
                label: 'Recurring Due Tomorrow',
                value: `${dueTomorrowRecurring} openings`,
            },
        ]
    }, [
        studiedToday,
        dueToday,
        totalCompleted,
        newRemaining,
        accuracyAll,
        accuracy7,
        longestDayStreak,
        longestCorrectOpeningStreak,
        currentCorrectOpeningStreak,
        timeTodayMin,
        time7dMin,
        timeTotalMin,
        perSideAcc7d,
        openingsMastered,
        dueTomorrowRecurring,
    ])

    const selectedStats = useMemo(
        () => statOptions.filter(s => selectedIds.includes(s.id)),
        [statOptions, selectedIds]
    )

    function toggleStat(id: string) {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(x => x !== id)
            }
            if (prev.length >= 5) {
                return prev
            }
            return [...prev, id]
        })
    }

    const previewText = buildPostText(platformParam, selectedStats)
    const siteUrl =
        typeof window !== 'undefined'
            ? window.location.origin + '/drill'
            : 'https://your-site-url.example/drill'

    function xShareUrl() {
        const text = previewText
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    }

    function facebookShareUrl() {
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`
    }

    function redditShareUrl() {
        return `https://www.reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent('My Brute Chess progress')}`
    }

    return (
        <Protected>
            <div className="max-w-4xl mx-auto space-y-8 py-6">
                <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-semibold">
                            Share your Brute Chess progress
                        </h1>
                        <p className="text-sm text-gray-500">
                            Target platform:{' '}
                            <span className="font-medium">
                                {platformLabel(platformParam)}
                            </span>
                        </p>
                    </div>

                </header>

                {loading && (
                    <div className="text-sm text-gray-500">Loading your stats…</div>
                )}

                {!loading && (
                    <>
                        {/* Stat selection */}
                        <section className="space-y-3">
                            <h2 className="text-lg font-semibold">1. Choose up to 5 stats to include</h2>
                            <p className="text-sm text-gray-500">
                                These are the same stats shown on your Stats page. Click to toggle them on or off.
                            </p>

                            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {statOptions.map(s => {
                                    const selected = selectedIds.includes(s.id)
                                    const disabled = !selected && selectedIds.length >= 5
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => toggleStat(s.id)}
                                            disabled={disabled}
                                            className={`text-left px-3 py-2 rounded-lg border text-sm transition
                                                ${selected
                                                    ? 'bg-emerald-50 border-emerald-300'
                                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                                }
                                                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
                                            `}
                                        >
                                            <div className="font-medium">{s.label}</div>
                                            <div className="text-xs text-gray-600 mt-1">{s.value}</div>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="text-xs text-gray-500">
                                Selected {selectedIds.length} / 5
                            </div>
                        </section>

                        {/* Preview */}
                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold">2. Preview your post</h2>

                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <p className="text-sm text-gray-500">
                                    Here is a preview poster you can download and share on{' '}
                                    {platformLabel(platformParam)}.
                                </p>
                                {/* Template selector */}
                                <div className="flex items-center gap-2 text-xs md:text-sm">
                                    <span className="text-gray-500">Poster style:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {posterTemplates.map(t => {
                                            const active = t.id === templateId
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => setTemplateId(t.id)}
                                                    className={`px-2.5 py-1 rounded-full border text-xs md:text-[11px] font-medium transition
                                                        ${active
                                                            ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {t.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Poster-style card */}
                            <div
                                ref={posterRef}
                                className={
                                    'relative overflow-hidden rounded-3xl p-6 md:p-8 shadow-2xl ' +
                                    templateStyles.container
                                }
                            >
                                {/* subtle chess background glyphs */}
                                <div
                                    className={
                                        'pointer-events-none absolute inset-0 ' +
                                        templateStyles.glyphOpacity
                                    }
                                    aria-hidden="true"
                                >
                                    <div className="absolute -top-10 -left-4 text-7xl md:text-8xl">
                                        ♞
                                    </div>
                                    <div className="absolute -bottom-10 -right-6 text-7xl md:text-8xl">
                                        ♛
                                    </div>
                                </div>

                                <div className="relative space-y-6">
                                    {/* header row (no platform label chip now) */}
                                    <div className="space-y-1">
                                        <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                                            Brute Chess
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-bold">
                                            Opening Training Progress
                                        </h3>
                                    </div>

                                    {/* date */}
                                    <div className="text-xs text-emerald-100">
                                        {new Date().toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </div>

                                    {/* stats grid */}
                                    <div className="grid sm:grid-cols-2 gap-4 mt-2">
                                        {selectedStats.length === 0 && (
                                            <div className="text-sm text-emerald-100">
                                                Select up to 5 stats above to include them in your poster.
                                            </div>
                                        )}

                                        {selectedStats.map(s => (
                                            <div
                                                key={s.id}
                                                className={
                                                    'rounded-2xl px-4 py-3 flex flex-col gap-1 ' +
                                                    templateStyles.statCard
                                                }
                                            >
                                                <div className="text-[11px] uppercase tracking-wide text-emerald-100">
                                                    {s.label}
                                                </div>
                                                <div className="text-lg font-semibold">
                                                    {s.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* footer / hashtags */}
                                    <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/10 mt-4">
                                        <div className="text-xs text-emerald-100 max-w-xs text-left">
                                            Keep sharpening your openings every day. Small improvements add up
                                            to big rating gains.
                                        </div>
                                        <div className="text-xs sm:text-sm font-medium text-emerald-100 text-left sm:text-right whitespace-pre-line">
                                            {hashtags(platformParam)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
<div className="flex flex-wrap items-center gap-3 pt-2">
    <button
        type="button"
        onClick={handleDownloadPoster}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
    >
        Download poster as image
    </button>

    <span className="text-[11px] text-gray-500">and share on:</span>

    <a
        href={xShareUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-gray-700 underline underline-offset-2 hover:no-underline"
    >
        X
    </a>
    <a
        href={facebookShareUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-gray-700 underline underline-offset-2 hover:no-underline"
    >
        Facebook
    </a>
    <a
        href={redditShareUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-gray-700 underline underline-offset-2 hover:no-underline"
    >
        Reddit
    </a>
    {/* For Instagram, just tell them to upload the downloaded image */}
</div>
                            

                            {/* Optional caption to copy-paste */}
                            <div className="space-y-2">
                                <p className="text-xs text-gray-500">
                                    Optional caption text you can copy and paste:
                                </p>
                                <textarea
                                    readOnly
                                    value={previewText}
                                    className="w-full min-h-[140px] rounded-lg border border-gray-200 bg-white shadow-sm p-3 text-xs font-mono whitespace-pre-wrap"
                                />
                            </div>
                        </section>
                    </>
                )}
            </div>
        </Protected>
    )
}

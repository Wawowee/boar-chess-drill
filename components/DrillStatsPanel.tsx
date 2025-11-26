'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { X } from 'lucide-react'

type Props = { open: boolean; onClose: () => void }

type EventRow = { line_id: string; result: 'pass' | 'fail'; seen_at: string }
type ReviewRow = {
    line_id: string
    last_result: 'pass' | 'fail' | null
    last_seen_at: string | null
    interval_days: number | null
    due_on: string | null
    status?: string | null
}

const USER_TZ =
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'

/* -------------------- helpers -------------------- */
function localDay3am(offsetDays = 0): string {
    const d = new Date()
    d.setHours(d.getHours() - 3)
    d.setDate(d.getDate() + offsetDays)
    return d.toLocaleDateString('en-CA', { timeZone: USER_TZ }) // YYYY-MM-DD
}
function iso3am(day: string) { return `${day}T03:00:00` }
function dayString3am(d: Date) {
    const copy = new Date(d)
    copy.setHours(copy.getHours() - 3)
    return copy.toLocaleDateString('en-CA', { timeZone: USER_TZ })
}
function readSecondsForDay(uid: string | null, day: string) {
    try {
        const key = `bc_time_spent:${uid ?? 'anon'}:${day}`
        return Number(localStorage.getItem(key) ?? '0') || 0
    } catch { return 0 }
}
function fmtMinutes(totalSec: number) {
    const m = Math.round(totalSec / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
}

/** Daily accuracy: per (day,line) a single outcome that is FAIL if any fail occurred */
function computeAccuracyFromEvents(rows: EventRow[], fromDay: string, thruDay: string) {
    const byDayLine = new Map<string, { hadFail: boolean }>()
    for (const r of rows ?? []) {
        const localDay = dayString3am(new Date(r.seen_at))
        if (localDay < fromDay || localDay > thruDay) continue
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

/** Current correct opening streak (recurring only by history, today only) */
function computeCurrentCorrectStreakRecurringByHistory(events: EventRow[] | null) {
    if (!events || events.length === 0) return 0

    const today = localDay3am(0)

    // 1) Which lines are "recurring" (have any history before today, using 3am-local day buckets)?
    const hadPrior = new Set<string>()
    for (const e of events) {
        const d = dayString3am(new Date(e.seen_at))
        if (d < today) {
            hadPrior.add(e.line_id)
        }
    }

    // 2) Today-only events, but only for those recurring lines
    const todaysEligible = events
        .filter(e => {
            const d = dayString3am(new Date(e.seen_at))
            return d === today && hadPrior.has(e.line_id)
        })
        .sort(
            (a, b) =>
                new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
        )

    // 3) Walk backwards until first fail
    let cur = 0
    for (let i = todaysEligible.length - 1; i >= 0; i--) {
        if (todaysEligible[i].result === 'pass') cur++
        else break
    }

    return cur
}


/* -------------------- component -------------------- */
export default function DrillStatsPanel({ open, onClose }: Props) {
    const [events, setEvents] = useState<EventRow[] | null>(null)
    const [rows, setRows] = useState<ReviewRow[] | null>(null)

    const [dueTodayOverride, setDueTodayOverride] = useState<number | null>(null)
    const [dueTomorrow, setDueTomorrow] = useState(0)
    const [accuracyToday, setAccuracyToday] =
        useState<{ clean: number; total: number; pct: number }>({ clean: 0, total: 0, pct: 100 })
    const [currentCorrectStreak, setCurrentCorrectStreak] = useState(0)
    const [timeTodayMin, setTimeTodayMin] = useState(0)

    const [uid, setUid] = useState<string | null>(null)
    const [deckId, setDeckId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const COUNTERS_KEY = useMemo(
        () => `bc_today_counters:${uid ?? 'anon'}:${deckId ?? 'nodeck'}`,
        [uid, deckId]
    )

    // get uid once
    useEffect(() => {
        supabase.auth.getUser().then((resp: { data: { user: { id: string } | null } }) => {
            const u = resp.data.user
            setUid(u?.id ?? null)
        })
    }, [])

    // hydrate "Due Today" (sum of New+Recurring) from localStorage
    useEffect(() => {
        const readCounters = () => {
            try {
                const raw = localStorage.getItem(COUNTERS_KEY) ?? localStorage.getItem('bc_today_counters')
                if (!raw) { setDueTodayOverride(null); return }
                const obj = JSON.parse(raw) as { day?: string; newDue?: number; recurringDue?: number }
                const today = localDay3am(0)
                if (obj?.day === today) setDueTodayOverride((obj.newDue ?? 0) + (obj.recurringDue ?? 0))
                else setDueTodayOverride(null)
            } catch { setDueTodayOverride(null) }
        }
        readCounters()
        const onVis = () => { if (document.visibilityState === 'visible') readCounters() }
        const onStorage = (e: StorageEvent) => {
            if (e.key === COUNTERS_KEY || e.key === 'bc_today_counters') readCounters()
        }
        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('storage', onStorage)
        return () => {
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('storage', onStorage)
        }
    }, [COUNTERS_KEY])

    // load rows/events + compute all six stats
    // load rows/events + compute all six stats, scoped to current deck
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data: auth } = await supabase.auth.getUser();
                const myUid = auth.user?.id;
                if (!myUid) { setLoading(false); return; }

                const today = localDay3am(0);
                const tomorrow = localDay3am(1);

                // 1) Which deck is active for this user?
                const { data: settings, error: settingsErr } = await supabase
                    .from('user_settings')
                    .select('current_deck_id')
                    .eq('user_id', myUid)
                    .maybeSingle();

                if (settingsErr) {
                    console.error('user_settings error in stats panel', settingsErr);
                }

                const currentDeckId: string | null = settings?.current_deck_id ?? null;
                if (!cancelled) {
                    setDeckId(currentDeckId)
                }

                // 2) Map of line_ids that belong to this deck
                let allowedLineIds: Set<string> | null = null;
                if (currentDeckId) {
                    const { data: lineRows, error: lineErr } = await supabase
                        .from('lines')
                        .select('id, openings!inner(deck_id)')
                        .eq('openings.deck_id', currentDeckId);

                    if (lineErr) {
                        console.error('lines/deck map error in stats panel', lineErr);
                    } else {
                        allowedLineIds = new Set((lineRows ?? []).map((row: any) => row.id as string));
                    }
                }

                // 3) Load all events/reviews for this user
                const [{ data: ev }, { data: r }] = await Promise.all([
                    supabase
                        .from('review_events')
                        .select('line_id,result,seen_at')
                        .eq('user_id', myUid),
                    supabase
                        .from('reviews')
                        .select('line_id,last_result,last_seen_at,interval_days,due_on,status')
                        .eq('user_id', myUid),
                ]);
                if (cancelled) return;

                const allEvents = (ev ?? []) as EventRow[];
                const allReviews = (r ?? []) as ReviewRow[];

                // 4) Filter everything to the current deck (if one is set)
                const evFiltered = allowedLineIds
                    ? allEvents.filter(e => allowedLineIds!.has(e.line_id))
                    : allEvents;

                const rFiltered = allowedLineIds
                    ? allReviews.filter(row => allowedLineIds!.has(row.line_id))
                    : allReviews;

                setEvents(evFiltered);
                setRows(rFiltered);

                // 5) Recurring due tomorrow (for this deck only)
                const recTomorrow = rFiltered.filter(row =>
                    row.due_on === tomorrow &&
                    ['learning', 'review'].includes(row.status ?? '')
                ).length;
                setDueTomorrow(recTomorrow);

                // 6) Daily accuracy for today (deck-only)

                setAccuracyToday(
                    computeAccuracyFromEvents(evFiltered, today, today)
                );

                // 7) Current correct opening streak (deck-only)
                setCurrentCorrectStreak(
                    computeCurrentCorrectStreakRecurringByHistory(evFiltered)
                );

                // 8) Time spent today (still per-user; not split by deck)
                const secToday = readSecondsForDay(myUid, today);
                setTimeTodayMin(Math.round(secToday / 60));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);


    // derived: studied today (by last_seen_at)
    const todayLocal = useMemo(() => localDay3am(0), [])
    const studiedToday = useMemo(() => {
        if (!rows) return 0
        return rows.filter(r => r.last_seen_at && dayString3am(new Date(r.last_seen_at)) === todayLocal).length
    }, [rows, todayLocal])

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className={`fixed inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            />

            {/* Slide-over panel */}
            <aside
                className={`fixed right-0 top-0 h-full w-[360px] bg-white border-l shadow-xl p-4 transition-transform duration-300
          ${open ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
                aria-hidden={!open}
            >
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold">Stats</h2>
                    <button onClick={onClose} aria-label="Close panel" className="p-2 rounded hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 overflow-y-auto text-sm text-gray-500">Loading…</div>
                ) : (
                    <div className="flex-1 overflow-y-auto pr-1">
                        <div className="space-y-3 pb-8">
                            {/* Row: Studied Today / Due Today */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg border shadow-sm">
                                    <div className="text-xs text-gray-500">Studied Today</div>
                                    <div className="text-2xl font-semibold">{studiedToday}</div>
                                </div>
                                <div className="p-3 rounded-lg border shadow-sm">
                                    <div className="text-xs text-gray-500">Due Today</div>
                                    <div className="text-2xl font-semibold">{dueTodayOverride ?? 0}</div>
                                    <div className="text-[10px] text-gray-400">
                                        {dueTodayOverride != null ? '' : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Recurring Due Tomorrow */}
                            <div className="p-3 rounded-lg border shadow-sm">
                                <div className="text-xs text-gray-500">Recurring Due Tomorrow</div>
                                <div className="text-2xl font-semibold">{dueTomorrow}</div>
                            </div>

                            {/* Daily Accuracy */}
                            <div className="p-3 rounded-lg border shadow-sm">
                                <div className="text-xs text-gray-500">Daily Accuracy</div>
                                <div className="text-xl font-bold">{accuracyToday.pct.toFixed(1)}%</div>
                                <div className="text-[11px] text-gray-500">
                                    {accuracyToday.clean} / {accuracyToday.total}
                                </div>
                            </div>

                            {/* Current Correct Opening Streak */}
                            <div className="p-3 rounded-lg border shadow-sm">
                                <div className="text-xs text-gray-500">Current Correct Opening Streak</div>
                                <div className="text-2xl font-semibold">{currentCorrectStreak}</div>
                            </div>

                            {/* Time Spent Today */}
                            <div className="p-3 rounded-lg border shadow-sm">
                                <div className="text-xs text-gray-500">Time Spent Today</div>
                                <div className="text-xl font-bold">{fmtMinutes(timeTodayMin * 60)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        </>
    )
}

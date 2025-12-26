'use client'

import Protected from '@/app/protected'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

/** ---------- Shared helpers (copied from DrillStatsPanel so values match) ---------- */
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

type Deck = {
    id: string
    name: string
    is_hidden: boolean
}


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
function iso3am(day: string) { return `${day}T03:00:00` }

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
/** time-on-Drill, same as panel (localStorage) */
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
    if (!events || events.length === 0) return 0

    const today = localDay3am(0)

    // 1) recurring lines: any event whose 3am-local day is before today
    const hadPrior = new Set<string>()
    for (const e of events) {
        const d = dayString3am(new Date(e.seen_at))
        if (d < today) {
            hadPrior.add(e.line_id)
        }
    }

    // 2) today's events for those recurring lines
    const todaysEligible = events
        .filter(e => {
            const d = dayString3am(new Date(e.seen_at))
            return d === today && hadPrior.has(e.line_id)
        })
        .sort(
            (a, b) =>
                new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
        )

    // 3) walk backward until first fail
    let cur = 0
    for (let i = todaysEligible.length - 1; i >= 0; i--) {
        if (todaysEligible[i].result === 'pass') cur++
        else break
    }

    return cur
}


function dayStringToLocalDate(day: string) {
    const [y, m, d] = day.split('-').map(Number)
    return new Date(y, m - 1, d)
}




function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {children}
        </section>
    );
}

function StatCard({
    label,
    value,
    sub,
}: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
}) {
    return (
        <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-black/5 dark:ring-white/10 shadow-sm p-4">
            <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{label}</div>
            <div className="mt-1 text-2xl md:text-3xl font-bold">{value}</div>
            {sub && <div className="mt-1 text-[11px] md:text-xs text-gray-500">{sub}</div>}
        </div>
    );
}


/** ---------- /helpers ---------- */

export default function StatsPage() {
    const [rows, setRows] = useState<ReviewRow[] | null>(null)
    const [events, setEvents] = useState<EventRow[] | null>(null)
    const [linesWithSide, setLinesWithSide] = useState<LineWithSide[] | null>(null)
    const [dueTodayOverride, setDueTodayOverride] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [uid, setUid] = useState<string | null>(null)
    const [decks, setDecks] = useState<Deck[]>([])
    const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)
    const [initialDeckId, setInitialDeckId] = useState<string | null>(null)
    const [allowedLineIds, setAllowedLineIds] = useState<Set<string> | null>(null)

    // Keep a deck-specific map of line_ids, like DrillStatsPanel does
    useEffect(() => {
        let cancelled = false

            ; (async () => {
                // need user id first
                if (!uid) {
                    setAllowedLineIds(null)
                    return
                }

                // "All decks" → no deck filter on events/reviews
                // No deck selected yet → show nothing
                if (!selectedDeckId) {
                    setAllowedLineIds(new Set())
                    return
                }


                const { data, error } = await supabase
                    .from('lines')
                    .select('id, openings!inner(deck_id)')
                    .eq('openings.deck_id', selectedDeckId)

                if (cancelled) return

                if (error) {
                    console.error('lines/deck map error in stats page', error)
                    setAllowedLineIds(null)
                    return
                }

                setAllowedLineIds(
                    new Set((data ?? []).map((row: any) => row.id as string))
                )
            })()

        return () => { cancelled = true }
    }, [uid, selectedDeckId])

    // read uid
    useEffect(() => {
        supabase.auth.getUser().then((resp: { data: { user: { id: string } | null } }) => {
            const u = resp.data.user
            setUid(u?.id ?? null)
        })
    }, [])

    // hydrate the “Due Today” override (sum of New + Recurring) from localStorage
    // hydrate the “Due Today” override (sum of New + Recurring) from localStorage, per deck
    // hydrate the “Due Today” override (sum of New + Recurring) from localStorage, per deck or all decks
    useEffect(() => {
        const readCounters = () => {
            try {
                if (!uid) {
                    setDueTodayOverride(null)
                    return
                }

                const todayLocal = localDay3am(0)

                // "All decks": sum counters for every deck that has data for today
                if (!selectedDeckId || selectedDeckId === 'all') {
                    if (!decks || decks.length === 0) {
                        setDueTodayOverride(null)
                        return
                    }

                    let totalNew = 0
                    let totalRec = 0
                    let any = false

                    for (const d of decks) {
                        const key = `bc_today_counters:${uid}:${d.id}`
                        const raw = localStorage.getItem(key)
                        if (!raw) continue

                        const obj = JSON.parse(raw) as {
                            day?: string
                            newDue?: number
                            recurringDue?: number
                        }

                        if (obj.day !== todayLocal) continue

                        any = true
                        totalNew += obj.newDue ?? 0
                        totalRec += obj.recurringDue ?? 0
                    }

                    if (any) {
                        setDueTodayOverride(totalNew + totalRec)
                    } else {
                        setDueTodayOverride(null)
                    }
                    return
                }

                // Single deck: just read that deck’s counters
                const deckKey = selectedDeckId ?? 'nodeck'
                const key = `bc_today_counters:${uid}:${deckKey}`

                const raw =
                    localStorage.getItem(key) ??
                    // fallback for older global keys
                    localStorage.getItem(`bc_today_counters:${uid}`) ??
                    localStorage.getItem('bc_today_counters')

                if (!raw) {
                    setDueTodayOverride(null)
                    return
                }

                const obj = JSON.parse(raw) as {
                    day?: string
                    newDue?: number
                    recurringDue?: number
                }

                if (obj.day === todayLocal) {
                    setDueTodayOverride((obj.newDue ?? 0) + (obj.recurringDue ?? 0))
                } else {
                    setDueTodayOverride(null)
                }
            } catch {
                setDueTodayOverride(null)
            }
        }

        readCounters()

        const onVis = () => {
            if (document.visibilityState === 'visible') readCounters()
        }

        const onStorage = (e: StorageEvent) => {
            if (e.key && e.key.startsWith(`bc_today_counters:${uid ?? 'anon'}`)) {
                readCounters()
            }
        }

        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('storage', onStorage)
        return () => {
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('storage', onStorage)
        }
    }, [uid, selectedDeckId, decks])



    // load DB data
    // load DB data (handles >1000 lines by paging)
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            const myUid = auth.user?.id;
            if (!myUid) {
                if (!cancelled) setLoading(false);
                return;
            }

            const [
                { data: reviewData, error: revErr },
                { data: ev, error: evErr },
                { data: openingRows, error: openErr },
                { data: deckRows, error: deckErr },
                { data: settings, error: settingsErr },
            ] = await Promise.all([
                supabase
                    .from('reviews')
                    .select(
                        'line_id,last_result,last_seen_at,interval_days,due_on,status'
                    )
                    .eq('user_id', myUid),
                supabase
                    .from('review_events')
                    .select('line_id,result,seen_at')
                    .eq('user_id', myUid),
                supabase
                    .from('openings')
                    .select('id,name,side,deck_id'),
                supabase
                    .from('decks')
                    .select('id,name,is_hidden')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('user_settings')
                    .select('current_deck_id')
                    .eq('user_id', myUid)
                    .maybeSingle(),
            ]);

            if (cancelled) return;

            if (!revErr) setRows((reviewData ?? []) as ReviewRow[]);
            if (!evErr) setEvents((ev ?? []) as EventRow[]);

            let visibleDecks: Deck[] = [];
            if (!deckErr) {
                const deckData = (deckRows ?? []) as Deck[];
                // Only show decks that are NOT hidden
                visibleDecks = deckData.filter(d => !d.is_hidden);
                setDecks(visibleDecks);
            }


            // ---------- fetch *all* lines in pages of 1000 ----------
            type LineRow = {
                id: string;
                is_active: boolean | null;
                line_name: string | null;
                opening_id: string | null;
            };

            const PAGE_SIZE = 1000;
            let from = 0;
            let allLines: LineRow[] = [];

            while (true) {
                const { data, error } = await supabase
                    .from('lines')
                    .select('id,is_active,line_name,opening_id')
                    .range(from, from + PAGE_SIZE - 1);

                if (cancelled) return;

                if (error) {
                    console.error('lines fetch error in stats page', error);
                    break;
                }

                const batch = (data ?? []) as LineRow[];

                allLines = allLines.concat(batch);

                if (batch.length < PAGE_SIZE) {
                    // last page
                    break;
                }

                from += PAGE_SIZE;
            }

            // ---------- join lines → openings to build linesWithSide ----------
            if (!openErr) {
                type OpeningRow = {
                    id: string;
                    name: string | null;
                    side: 'white' | 'black' | 'both';
                    deck_id: string | null;
                };

                const openingsTyped = (openingRows ?? []) as OpeningRow[];

                const openingsById = new Map<string, OpeningRow>(
                    openingsTyped.map((o) => [o.id, o]),
                );


                const joined: LineWithSide[] = allLines.map(line => {
                    const op = line.opening_id
                        ? openingsById.get(line.opening_id) ?? null
                        : null;
                    return {
                        id: line.id,
                        is_active: line.is_active ?? true,
                        line_name: line.line_name,
                        openings: op
                            ? {
                                side: op.side,
                                name: op.name,
                                deck_id: op.deck_id,
                            }
                            : null,
                    };
                });

                setLinesWithSide(joined);
            }

            const currentDeckId = settingsErr
                ? null
                : (settings?.current_deck_id ?? null);

            // Prefer the user's saved deck if it's visible; otherwise
            // fall back to "Brute 1000 Opening Challenge" if present;
            // finally fall back to "all".
            let initialDeckId = currentDeckId || null;

            // If the saved deck is hidden (or decks list is empty), treat as null
            if (initialDeckId && !visibleDecks.some(d => d.id === initialDeckId)) {
                initialDeckId = null;
            }

            // If we still don't have an initial deck, try Brute 1000 Opening Challenge
            if (!initialDeckId) {
                const bruteDeck = visibleDecks.find(
                    d => d.name === 'BruteChess 1000 Opening Challenge'
                );
                if (bruteDeck) {
                    initialDeckId = bruteDeck.id;
                }
            }

            // pick a real deck if possible
            const finalDeckId = initialDeckId || visibleDecks[0]?.id || null

            setInitialDeckId(finalDeckId)
            setSelectedDeckId(finalDeckId)




            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);




    /** ---------- derived stats (same math as panel) ---------- */
    const todayLocal = useMemo(() => localDay3am(0), [])
    const tomorrowLocal = useMemo(() => localDay3am(1), [])

    const linesFiltered = useMemo(() => {
        if (!linesWithSide) return null
        if (!selectedDeckId) return []
        return linesWithSide.filter(
            l => l.openings?.deck_id === selectedDeckId
        )
    }, [linesWithSide, selectedDeckId])

    const lineIdSet = useMemo(() => {
        if (!linesFiltered) return null
        return new Set(linesFiltered.map(l => l.id))
    }, [linesFiltered])

    const rowsFiltered = useMemo(() => {
        if (!rows) return null
        // No deck filter (all decks) → use all rows
        if (!allowedLineIds) return rows
        return rows.filter(r => allowedLineIds.has(r.line_id))
    }, [rows, allowedLineIds])

    const eventsFiltered = useMemo(() => {
        if (!events) return null
        if (!allowedLineIds) return events
        return events.filter(e => allowedLineIds.has(e.line_id))
    }, [events, allowedLineIds])




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


    const effectiveDueToday = useMemo(() => {
        if (dueTodayOverride != null) return dueTodayOverride
        return dueToday
    }, [dueTodayOverride, dueToday])



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


    // “Openings mastered” (interval ≥ 20 and no fails in last 30d, active, not removed)
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


    // Per-side accuracy (7d window, collapse by day/line with “any-fail=fail”)
    const perSideAcc7d = useMemo(() => {
        if (!eventsFiltered || !linesFiltered) return { white: 100, black: 100 }
        const start7 = localDay3am(-6)
        const dayLineHadFail = new Map<string, boolean>()
            ; (eventsFiltered ?? []).forEach(e => {
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


    // Time spent (today / 7d / all-time) from localStorage (same as panel)
    const timeTodayMin = useMemo(() => Math.round(readSecondsForDay(uid, todayLocal) / 60), [uid, todayLocal])
    const time7dMin = useMemo(() => Math.round(readSeconds7d(uid) / 60), [uid])
    const timeTotalMin = useMemo(() => Math.round(readSecondsAllTime(uid) / 60), [uid])

    // Due forecast next 7 days (recurring only)
    const forecast = useMemo(() => {
        if (!rowsFiltered) return [] as Array<{ date: string; count: number }>

        const byDate = new Map<string, number>()
        for (let i = 1; i <= 7; i++) byDate.set(localDay3am(i), 0)

        for (const r of rowsFiltered) {
            if (!r.due_on) continue
            const st = (r.status ?? '')
            if (st !== 'learning' && st !== 'review') continue
            const d = r.due_on
            if (d > todayLocal && d <= localDay3am(7)) {
                byDate.set(d, (byDate.get(d) ?? 0) + 1)
            }
        }

        const out: Array<{ date: string; count: number }> = []
        for (let i = 1; i <= 7; i++) {
            const d = localDay3am(i)
            out.push({ date: d, count: byDate.get(d) ?? 0 })
        }
        return out
    }, [rowsFiltered, todayLocal])


    // Find max to scale bars relatively; avoid divide-by-zero with Math.max(1,...)
    const maxForecast = useMemo(
        () => Math.max(1, ...forecast.map(f => f.count)),
        [forecast]
    );

    // Height in px using a gentle sqrt scaling so differences remain visible
    function barHeightPx(count: number) {
        const h = Math.round(70 * Math.sqrt(count / maxForecast)); // 0..70px
        return `${Math.max(2, h)}px`; // keep a 2px stem for zero/small values
    }



    // Hardest lines (fails)
    const hardestToday = useMemo(() => {
        if (!eventsFiltered || !linesFiltered) return []
        const todayIso = iso3am(todayLocal)
        const tomorrowIso = iso3am(tomorrowLocal)
        const counts = new Map<string, number>()
        for (const e of eventsFiltered) {
            if (e.seen_at >= todayIso && e.seen_at < tomorrowIso && e.result === 'fail') {
                counts.set(e.line_id, (counts.get(e.line_id) ?? 0) + 1)
            }
        }
        const labelFor = (lineId: string) => {
            const ln = linesFiltered.find(x => x.id === lineId)
            const op = ln?.openings?.name ?? 'Opening'
            const nm = ln?.line_name ?? ''
            return nm ? `${op} — ${nm}` : op
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([id, count]) => ({ id, count, label: labelFor(id) }))
    }, [eventsFiltered, linesFiltered, todayLocal, tomorrowLocal])

    const hardestMonth = useMemo(() => {
        if (!eventsFiltered || !linesFiltered) return []
        const start30 = iso3am(localDay3am(-29))
        const endNext = iso3am(localDay3am(1))
        const counts = new Map<string, number>()
        for (const e of eventsFiltered) {
            if (e.seen_at >= start30 && e.seen_at < endNext && e.result === 'fail') {
                counts.set(e.line_id, (counts.get(e.line_id) ?? 0) + 1)
            }
        }
        const labelFor = (lineId: string) => {
            const ln = linesFiltered.find(x => x.id === lineId)
            const op = ln?.openings?.name ?? 'Opening'
            const nm = ln?.line_name ?? ''
            return nm ? `${op} — ${nm}` : op
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([id, count]) => ({ id, count, label: labelFor(id) }))
    }, [eventsFiltered, linesFiltered])


    // Total Remaining / Completed
    // Total Remaining / Completed – based on recurring schedule (reviews.due_on)
    const linesTotal = useMemo(() => {
        // total active lines in the current view (deck or all decks)
        return (linesFiltered ?? []).filter(l => l.is_active).length
    }, [linesFiltered])

    const totalCompleted = useMemo(() => {
        if (!linesFiltered || !rows) return 0

        // active line IDs in the current deck / all decks
        const activeIds = new Set(
            (linesFiltered ?? []).filter(l => l.is_active).map(l => l.id)
        )

        const completed = new Set<string>()

        for (const r of rows ?? []) {
            // only count lines that belong to the current deck view
            if (!activeIds.has(r.line_id)) continue

            // ignore removed lines
            if ((r.status ?? '') === 'removed') continue

            // once a line has a due_on day, it has been sent into the
            // recurring schedule at least once (i.e., “sent for other days”)
            if (r.due_on) {
                completed.add(r.line_id)
            }
        }

        return completed.size
    }, [linesFiltered, rows])

    const newRemaining = useMemo(() => {
        // Total Remaining = total active openings in this deck minus completed
        return Math.max(0, linesTotal - totalCompleted)
    }, [linesTotal, totalCompleted])


    // Recurring Due Tomorrow
    const dueTomorrowRecurring = useMemo(() => {
        if (!rowsFiltered) return 0
        const tomorrow = localDay3am(1)
        return rowsFiltered.filter(
            r =>
                r.due_on === tomorrow &&
                ['learning', 'review'].includes(r.status ?? '')
        ).length
    }, [rowsFiltered])


    // Longest / Current Correct Opening Streaks (event-based)
    const longestCorrectOpeningStreak = useMemo(
        () => computeLongestCorrectStreak(eventsFiltered ?? []),
        [eventsFiltered]
    )

    const currentCorrectOpeningStreak = useMemo(
        () => computeCurrentCorrectStreakRecurringByHistory(eventsFiltered ?? []),
        [eventsFiltered]
    )



    return (
        <Protected>
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                    {/* Left: heading + deck label + share icons */}
                    <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl md:text-3xl font-semibold">Stats</h1>

                            {/* Share row to the right of heading */}
                            <div className="flex items-center gap-2">
                                <div className="flex gap-2">
                                    {/* X / Twitter */}
                                    <Link
                                        href="/share?platform=x"
                                        aria-label="Share on X"
                                        className="w-8 h-8 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="w-4 h-4 text-black"
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
                                        className="w-8 h-8 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="w-4 h-4 text-blue-600"
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
                                        className="w-8 h-8 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="w-4 h-4 text-orange-500"
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
                                        className="w-8 h-8 rounded-full border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-300"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="w-4 h-4 text-pink-500"
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

                        {/* deck label below heading */}
                        {selectedDeckId !== 'all' && selectedDeckId && (
                            <div className="text-sm text-gray-500">
                                Deck:{' '}
                                <span className="font-medium">
                                    {decks.find(d => d.id === selectedDeckId)?.name ?? 'Unknown'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Right: deck selector (unchanged) */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">View stats for</span>
                        <select
                            className="text-sm px-2 py-1 border rounded-lg bg-white dark:bg-slate-900"
                            value={selectedDeckId ?? ''}
                            onChange={e => setSelectedDeckId(e.target.value || null)}

                            disabled={loading || decks.length === 0}
                        >
                            
                            {decks.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                        {loading && (
                            <div className="text-sm text-gray-500">
                                Loading…
                            </div>
                        )}
                    </div>
                </header>



                {!loading && (
                    <>
                        {/* PROGRESS */}
                        <Section title="Progress">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatCard label="Studied Today" value={studiedToday} />
                                <StatCard
                                    label="Due Today"
                                    value={effectiveDueToday}
                                    sub={dueTodayOverride != null ? '' : 'From DB'}
                                />


                                <StatCard label="Total Completed" value={totalCompleted} />
                                <StatCard label="Total Remaining" value={newRemaining} />
                            </div>
                        </Section>

                        {/* ACCURACY & STREAKS */}
                        <Section title="Accuracy & Streaks">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatCard
                                    label="Accuracy (All-time)"
                                    value={`${accuracyAll.pct.toFixed(1)}%`}
                                    sub={`${accuracyAll.clean} / ${accuracyAll.total}`}
                                />
                                <StatCard
                                    label="Accuracy (Last 7 days)"
                                    value={`${accuracy7.pct.toFixed(1)}%`}
                                    sub={`${accuracy7.clean} / ${accuracy7.total}`}
                                />
                                <StatCard label="Longest Day Streak" value={longestDayStreak} />
                                <StatCard
                                    label="Current Correct Opening Streak"
                                    value={currentCorrectOpeningStreak}
                                    sub="Only includes reviews"
                                />
                            </div>
                        </Section>

                        {/* TIME */}
                        <Section title="Time">
                            <div className="grid grid-cols-3 gap-4">
                                <StatCard label="Time Spent Today" value={fmtMinutes(timeTodayMin * 60)} />
                                <StatCard label="Time Spent (Last 7 days)" value={fmtMinutes(time7dMin * 60)} />
                                <StatCard label="Total Time Spent" value={fmtMinutes(timeTotalMin * 60)} />
                            </div>
                        </Section>

                        {/* BREAKDOWN */}
                        <Section title="Breakdown">
                            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                                <StatCard
                                    label="White Accuracy (Last 7 days)"
                                    value={`${perSideAcc7d.white.toFixed(1)}%`}
                                />
                                <StatCard
                                    label="Black Accuracy (Last 7 days)"
                                    value={`${perSideAcc7d.black.toFixed(1)}%`}
                                />
                                <StatCard
                                    label="Openings Mastered"
                                    value={openingsMastered}
                                    sub=""
                                />
                                <StatCard label="Recurring Due Tomorrow" value={dueTomorrowRecurring} />
                            </div>
                        </Section>

                        {/* FORECAST & HARDEST */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <Section title="Due Forecast">
                                <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-black/5 dark:ring-white/10 shadow-sm p-4">
                                    <div className="grid grid-cols-7 gap-3 items-end">
                                        {forecast.map((f) => (
                                            <div key={f.date} className="text-center">
                                                {/* bar */}
                                                <div
                                                    className="mx-auto w-7 rounded bg-gray-300 dark:bg-slate-700"
                                                    style={{ height: barHeightPx(f.count) }}
                                                    title={`${f.count} due`}
                                                />
                                                {/* count */}
                                                <div className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-200">
                                                    {f.count}
                                                </div>
                                                {/* day label */}
                                                <div className="text-[10px] text-gray-500">
                                                    {dayStringToLocalDate(f.date).toLocaleDateString(undefined, {
                                                        weekday: 'short',
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Section>

                            <div className="grid gap-6">
                                <Section title="Hardest Lines Today">
                                    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-black/5 dark:ring-white/10 shadow-sm p-4">
                                        {hardestToday.length === 0 ? (
                                            <div className="text-sm text-gray-500">No fails today</div>
                                        ) : (
                                            <ol className="text-sm list-decimal ml-4 space-y-1">
                                                {hardestToday.map((r) => (
                                                    <li key={r.id} className="flex justify-between gap-2">
                                                        <span className="truncate">{r.label}</span>
                                                        <span className="text-gray-600 dark:text-gray-300">×{r.count}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                </Section>

                                <Section title="Hardest Lines (30 days)">
                                    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-black/5 dark:ring-white/10 shadow-sm p-4">
                                        {hardestMonth.length === 0 ? (
                                            <div className="text-sm text-gray-500">No fails in last 30 days</div>
                                        ) : (
                                            <ol className="text-sm list-decimal ml-4 space-y-1">
                                                {hardestMonth.map((r) => (
                                                    <li key={r.id} className="flex justify-between gap-2">
                                                        <span className="truncate">{r.label}</span>
                                                        <span className="text-gray-600 dark:text-gray-300">×{r.count}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                </Section>
                            </div>
                        </div>

                        {/* RECENT ACTIVITY */}
                        <Section title="Recent Activity">
                            <div className="overflow-hidden rounded-xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-black/5 dark:ring-white/10 shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50/70 dark:bg-slate-800/60">
                                        <tr className="text-left">
                                            <th className="p-2">When</th>
                                            <th className="p-2">Line</th>
                                            <th className="p-2">Result</th>
                                            <th className="p-2">Next in (days)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100/70 dark:divide-slate-800/80">
                                        {(rowsFiltered ?? [])
                                            .filter((r) => r.last_seen_at)
                                            .sort((a, b) => (b.last_seen_at! > a.last_seen_at! ? 1 : -1))
                                            .slice(0, 20)
                                            .map((r, i) => (
                                                <tr key={i}>
                                                    <td className="p-2">
                                                        {new Date(r.last_seen_at!).toLocaleString()}
                                                    </td>
                                                    <td className="p-2">{r.line_id.slice(0, 8)}…</td>
                                                    <td className="p-2">
                                                        {r.last_result === 'pass' ? (
                                                            <span className="text-green-600 font-medium">Pass</span>
                                                        ) : (
                                                            <span className="text-red-600 font-medium">Fail</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2">{r.interval_days ?? '-'}</td>
                                                </tr>
                                            ))}
                                    </tbody>

                                </table>
                            </div>
                        </Section>
                    </>
                )}
            </div>
        </Protected>
    );

}

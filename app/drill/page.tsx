'use client'
import Protected from '@/app/protected'
import { useEffect, useMemo, useState, useRef } from 'react'
import DrillFilters, { readDrillFilters } from '@/components/DrillFilters'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import OpeningDrill, { type OpeningDrillHandle } from '@/components/OpeningDrill'
import DrillStatsPanel from '@/components/DrillStatsPanel'
import { BarChart3 } from 'lucide-react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

const toolBtn =
    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
    "bg-white/80 backdrop-blur hover:bg-white transition " +
    "border-gray-200 shadow-sm hover:shadow focus:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2";

const iconOnlyBtn =
    "inline-flex items-center justify-center rounded-lg border p-2 " +
    "bg-white/80 backdrop-blur hover:bg-white transition " +
    "border-gray-200 shadow-sm hover:shadow focus:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2";

type QueueItem = {
    id: string
    moves_san: string[]
    isNew: boolean
    interval_days: number | null
    opening_name: string
    line_name?: string | null
    player_side: 'white' | 'black'
}

type DelayedEntry = { item: QueueItem; readyAt: number }

// Actual time-on-Drill tracking → writes seconds to localStorage
function useDrillTimeTracker(
    uid: string | null,
    localDay3amFn: (offsetDays?: number) => string
) {
    const startRef = useRef<number | null>(null);

    // The per-user, per-day key (your day boundary already uses 3am)
    const key = useMemo(
        () => `bc_time_spent:${uid ?? 'anon'}:${localDay3amFn(0)}`,
        [uid, localDay3amFn]
    );

    // Flush helper: add elapsed seconds into today's bucket
    const flushElapsed = () => {
        if (startRef.current == null) return;
        const now = Date.now();
        const deltaSec = Math.max(0, Math.floor((now - startRef.current) / 1000));
        startRef.current = now;
        try {
            const cur = Number(localStorage.getItem(key) ?? '0') || 0;
            localStorage.setItem(key, String(cur + deltaSec));
        } catch { /* ignore storage errors */ }
    };

    useEffect(() => {
        // start a session (key changes if uid/day changes)
        startRef.current = Date.now();

        const onVis = () => {
            if (document.visibilityState === 'hidden') {
                flushElapsed();
            } else {
                // resume
                startRef.current = Date.now();
            }
        };
        const onBeforeUnload = () => flushElapsed();

        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('pagehide', onBeforeUnload);
        window.addEventListener('beforeunload', onBeforeUnload);




        return () => {
            // unmount or key change → flush and clean up
            flushElapsed();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('pagehide', onBeforeUnload);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [key]); // re-run if user or day boundary changes
}


export default function DrillPage() {
    const router = useRouter()
    const [queue, setQueue] = useState<QueueItem[] | null>(null)
    const [idx, setIdx] = useState(0)

    // delayed items map (id -> entry). Using an object for easy serialization.
    const [delayed, setDelayed] = useState<Record<string, DelayedEntry>>({})
    // if we choose a delayed item, we render it via this override
    const [override, setOverride] = useState<QueueItem | null>(null)

    const [newDue, setNewDue] = useState<number>(10)
    const [recurringDue, setRecurringDue] = useState<number>(0)
    const mistakenThisSessionRef = useRef<Set<string>>(new Set());
    const [attemptKey, setAttemptKey] = useState(0)
    const USER_TZ =
        (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
        'UTC';
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [dailyCap, setDailyCap] = useState<number>(10);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [studyFirst, setStudyFirst] = useState(false);
    const [timePressure, setTimePressure] = useState(false);
    const [uid, setUid] = useState<string | null>(null);
    const [deckId, setDeckId] = useState<string | null>(null);
    const [deckName, setDeckName] = useState<string | null>(null);
    const FILTERS_KEY = useMemo(
        () => `bc_filters_v1:${uid ?? 'anon'}`,
        [uid]
    );

    // Use 'nodeck' as a safe fallback while deckId is still loading
    const deckKey = deckId ?? 'nodeck';

    const NEW_SHOWN_KEY = useMemo(
        () => `bc_new_shown_3am:${uid ?? 'anon'}:${deckKey}`,
        [uid, deckKey]
    );

    const COUNTERS_KEY = useMemo(
        () => `bc_today_counters:${uid ?? 'anon'}:${deckKey}`,
        [uid, deckKey]
    );
    const [authReady, setAuthReady] = useState(false);
    const [queuedNewCount, setQueuedNewCount] = useState(0);
    const QUEUED_IDS_KEY = useMemo(
        () => `bc_today_queued_ids:${uid ?? 'anon'}:${deckKey}`,
        [uid, deckKey]
    );
    const pendingNewToConsumeRef = useRef<Set<string>>(new Set());
    const suppressRecomputeUntilNextRef = useRef(false);
    const [statsOpen, setStatsOpen] = useState(false)
    const drillRef = useRef<OpeningDrillHandle | null>(null)
    const [mounted, setMounted] = useState(false);
    const [achievementBanner, setAchievementBanner] = useState<{
        id: string
        label: string
    } | null>(null)
    const bannerTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        if (!achievementBanner) return

        if (bannerTimeoutRef.current != null) {
            window.clearTimeout(bannerTimeoutRef.current)
        }

        bannerTimeoutRef.current = window.setTimeout(() => {
            setAchievementBanner(null)
            bannerTimeoutRef.current = null
        }, 20_000)

        return () => {
            if (bannerTimeoutRef.current != null) {
                window.clearTimeout(bannerTimeoutRef.current)
                bannerTimeoutRef.current = null
            }
        }
    }, [achievementBanner])




    useEffect(() => { setMounted(true); }, []);

    function migrateAnonToUser(u: string) {
        const pairs = [
            ['bc_filters_v1:anon', `bc_filters_v1:${u}`],
            ['bc_new_shown_3am:anon', `bc_new_shown_3am:${u}`],
            ['bc_today_counters:anon', `bc_today_counters:${u}`],
        ] as const
        for (const [from, to] of pairs) {
            try {
                const v = localStorage.getItem(from)
                if (v && !localStorage.getItem(to)) {
                    localStorage.setItem(to, v)
                }
            } catch { }
        }
    }

    function localDay3am(offsetDays = 0): string {
        const d = new Date();
        d.setHours(d.getHours() - 3);      // shift back 3 hours to implement the pivot
        d.setDate(d.getDate() + offsetDays);
        return d.toLocaleDateString('en-CA', { timeZone: USER_TZ }); // YYYY-MM-DD
    }

    function dayString3am(d: Date) {
        const copy = new Date(d)
        copy.setHours(copy.getHours() - 3)
        return copy.toLocaleDateString('en-CA', { timeZone: USER_TZ })
    }

    const DAY_MS = 24 * 60 * 60 * 1000


    function computeLongestPassStreak(
        events: { line_id: string; result: 'pass' | 'fail'; seen_at: string }[],
    ) {
        const days = new Set<string>()
        for (const ev of events ?? []) {
            if (ev.result !== 'pass') continue
            days.add(dayString3am(new Date(ev.seen_at)))
        }
        if (days.size === 0) return 0
        const arr = Array.from(days).sort()
        let longest = 1,
            cur = 1
        const toMidnight = (s: string) => {
            const [y, m, d] = s.split('-').map(Number)
            return new Date(y, m - 1, d).getTime()
        }
        for (let i = 1; i < arr.length; i++) {
            if (toMidnight(arr[i]) - toMidnight(arr[i - 1]) === DAY_MS) cur += 1
            else {
                longest = Math.max(longest, cur)
                cur = 1
            }
        }
        return Math.max(longest, cur)
    }


    function handlePersist(p: Promise<void>) {
        p.then(async () => {
            if (suppressRecomputeUntilNextRef.current) return // wait until Next Opening
            recomputeTodayCounters()
            await checkForNewAchievements()
        }).catch(() => { })
    }



    function readNewShown(todayLocal: string): Set<string> {
        try {
            const raw = localStorage.getItem(NEW_SHOWN_KEY);
            if (!raw) return new Set();
            const obj = JSON.parse(raw) as { day?: string; ids?: string[] };
            if (obj?.day !== todayLocal) return new Set(); // new day → reset
            return new Set(obj.ids ?? []);
        } catch {
            return new Set();
        }
    }

    function writeNewShown(todayLocal: string, ids: Set<string>) {
        try {
            localStorage.setItem(
                NEW_SHOWN_KEY,
                JSON.stringify({ day: todayLocal, ids: [...ids] })
            );
        } catch { }
    }

    function writeQueuedNewIds(todayLocal: string, ids: string[]) {
        try {
            localStorage.setItem(QUEUED_IDS_KEY, JSON.stringify({ day: todayLocal, ids }));
        } catch { }
    }

    function readQueuedNewIds(todayLocal: string): string[] {
        try {
            const raw = localStorage.getItem(QUEUED_IDS_KEY);
            if (!raw) return [];
            const obj = JSON.parse(raw) as { day?: string; ids?: string[] };
            if (obj?.day !== todayLocal) return [];
            return Array.isArray(obj.ids) ? obj.ids : [];
        } catch {
            return [];
        }
    }

    async function checkForNewAchievements() {
        if (!uid || !deckId) return

        const seenKey = `bc_achievements_seen:${uid}:${deckId}`
        let seen: Record<string, boolean> = {}
        try {
            const raw = localStorage.getItem(seenKey)
            if (raw) seen = JSON.parse(raw)
        } catch {
            seen = {}
        }

        // 1) Load raw stats from Supabase (same sources as Achievements page)
        const [
            { data: reviewData, error: revErr },
            { data: evData, error: evErr },
            { data: lsData, error: lsErr },
        ] = await Promise.all([
            supabase
                .from('reviews')
                .select(
                    'line_id,last_result,last_seen_at,interval_days,due_on,status',
                )
                .eq('user_id', uid),
            supabase
                .from('review_events')
                .select('line_id,result,seen_at')
                .eq('user_id', uid),
            supabase
                .from('lines')
                .select('id,is_active,openings(deck_id)'),
        ])

        if (revErr || evErr || lsErr) return

        type ReviewRow = {
            line_id: string
            last_result: 'pass' | 'fail' | null
            last_seen_at: string | null
            interval_days: number | null
            due_on: string | null
            status?: string | null
        }
        type EventRow = { line_id: string; result: 'pass' | 'fail'; seen_at: string }
        type LineRow = {
            id: string
            is_active: boolean
            openings: { deck_id?: string | null } | null
        }

        const linesAll = (lsData ?? []) as LineRow[]
        const linesFiltered = linesAll.filter(
            l => l.openings?.deck_id === deckId,
        )
        if (!linesFiltered.length) return

        const lineIdSet = new Set(linesFiltered.map(l => l.id))

        const rowsFiltered = ((reviewData ?? []) as ReviewRow[]).filter(r =>
            lineIdSet.has(r.line_id),
        )

        const eventsFiltered = ((evData ?? []) as EventRow[]).filter(e =>
            lineIdSet.has(e.line_id),
        )


        // --- Core stats (mirror Achievements page) ---

        const activeIds = new Set(
            linesFiltered.filter(l => l.is_active).map(l => l.id),
        )
        const linesTotal = activeIds.size

        // New remaining = active lines with NO review row
        let newRemaining = 0
        const myIds = new Set(rowsFiltered.map(r => r.line_id))
        for (const id of activeIds) if (!myIds.has(id)) newRemaining++
        const totalCompleted = Math.max(0, linesTotal - newRemaining)
        const completionPct =
            linesTotal === 0 ? 0 : (totalCompleted / linesTotal) * 100

        const longestDayStreak = computeLongestPassStreak(eventsFiltered)

        // Openings mastered: same definition as Achievements page
        const thirtyAgo = localDay3am(-30)
        const failedRecently = new Set(
            eventsFiltered
                .filter(
                    e =>
                        e.result === 'fail' &&
                        dayString3am(new Date(e.seen_at)) >= thirtyAgo,
                )
                .map(e => e.line_id),
        )
        const byId = new Map(rowsFiltered.map(r => [r.line_id, r]))
        let openingsMastered = 0
        for (const id of activeIds) {
            const rr = byId.get(id)
            if (!rr) continue
            if ((rr.status ?? '') === 'removed') continue
            const interval = rr.interval_days ?? 0
            if (interval < 20) continue
            if (failedRecently.has(id)) continue
            openingsMastered += 1
        }
        const masteryPct =
            linesTotal === 0 ? 0 : (openingsMastered / linesTotal) * 100

        // --- Achievement thresholds (IDs match Achievements page) ---

        type SimpleAch = { id: string; label: string; unlocked: boolean }

        const streakAchievements: SimpleAch[] = [
            { id: 'streak_2d', label: '2 day streak', unlocked: longestDayStreak >= 2 },
            { id: 'streak_5d', label: '5 day streak', unlocked: longestDayStreak >= 5 },
            { id: 'streak_2w', label: '2 week streak', unlocked: longestDayStreak >= 14 },
            { id: 'streak_1m', label: '1 month streak', unlocked: longestDayStreak >= 30 },
            { id: 'streak_3m', label: '3 month streak', unlocked: longestDayStreak >= 90 },
            { id: 'streak_6m', label: '6 month streak', unlocked: longestDayStreak >= 180 },
            { id: 'streak_1y', label: '1 year streak', unlocked: longestDayStreak >= 365 },
        ]

        const completionAchievements: SimpleAch[] = [
            { id: 'comp_10', label: '10 openings completed', unlocked: totalCompleted >= 10 },
            { id: 'comp_50', label: '50 openings completed', unlocked: totalCompleted >= 50 },
            { id: 'comp_100', label: '100 openings completed', unlocked: totalCompleted >= 100 },
            { id: 'comp_25pct', label: '25% of openings completed', unlocked: completionPct >= 25 },
            { id: 'comp_50pct', label: '50% of openings completed', unlocked: completionPct >= 50 },
            { id: 'comp_75pct', label: '75% of openings completed', unlocked: completionPct >= 75 },
            { id: 'comp_100pct', label: '100% of openings completed', unlocked: completionPct >= 100 },
        ]


        const masteryAchievements: SimpleAch[] = [
            { id: 'mast_1', label: '1 opening mastered', unlocked: openingsMastered >= 1 },
            { id: 'mast_10', label: '10 openings mastered', unlocked: openingsMastered >= 10 },
            { id: 'mast_100', label: '100 openings mastered', unlocked: openingsMastered >= 100 },
            { id: 'mast_50pct', label: '50% openings mastered', unlocked: masteryPct >= 50 },
            { id: 'mast_75pct', label: '75% openings mastered', unlocked: masteryPct >= 75 },
            { id: 'mast_100pct', label: '100% openings mastered', unlocked: masteryPct >= 100 },
        ]

        const all = [
            ...streakAchievements,
            ...completionAchievements,
            ...masteryAchievements,
        ]

        // Find the first achievement that just flipped from locked -> unlocked
        const newlyUnlocked = all.find(a => a.unlocked && !seen[a.id])
        if (!newlyUnlocked) return

        // Record it so we don’t show this banner again for this deck
        seen[newlyUnlocked.id] = true
        try {
            localStorage.setItem(seenKey, JSON.stringify(seen))
        } catch { }

        setAchievementBanner({
            id: newlyUnlocked.id,
            label: newlyUnlocked.label,
        })
    }


    async function recomputeTodayCounters(queuedOverride?: number) {
        const todayLocal = localDay3am(0);

        // Recurring Due Today, scoped to current deck
        const { data: recRows, error: recErr } = await supabase
            .from('reviews')
            .select(
                'line_id, lines!inner(id, openings!inner(deck_id))'
            )
            .lte('due_on', todayLocal)
            .in('status', ['learning', 'review']);

        if (recErr) {
            console.error('recomputeTodayCounters recurring error', recErr);
        }

        const recurring = (recRows ?? []).filter(
            (r: any) => !deckId || r.lines?.openings?.deck_id === deckId
        ).length;

        setRecurringDue(recurring);

        // --- New Due Today: keep your existing logic unchanged below this line ---

        const shownToday = readNewShown(todayLocal);
        const queuedIds = readQueuedNewIds(todayLocal);
        const queued = (typeof queuedOverride === 'number')
            ? queuedOverride
            : (queuedIds.length || queuedNewCount);

        let completedFromQueued = 0;
        if (queuedIds.length) {
            for (const id of queuedIds) {
                if (shownToday.has(id)) completedFromQueued++;
            }
        } else {
            completedFromQueued = shownToday.size;
        }

        const remainingNew = Math.max(0, queued - completedFromQueued);
        setNewDue(remainingNew);

        try {
            localStorage.setItem(
                COUNTERS_KEY,
                JSON.stringify({ day: todayLocal, newDue: remainingNew, recurringDue: recurring })
            );
        } catch { /* ignore */ }
    }


    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const id = user?.id ?? null;
            setUid(user?.id ?? null);
            if (id) {
                migrateAnonToUser(id);                   // ← migrate once we know uid
                try {
                    const raw = localStorage.getItem(`bc_filters_v1:${id}`)
                    if (raw) {
                        const f = JSON.parse(raw)
                        if (typeof f?.dailyNewCap === 'number') setDailyCap(f.dailyNewCap)
                    }
                } catch { }
            }
            setAuthReady(true);
        })();
    }, []);

    useEffect(() => {
        if (!uid) {
            setDeckId(null);
            setDeckName(null);
            return;
        }

        (async () => {
            // 1) Get current_deck_id for this user
            const { data: settings, error } = await supabase
                .from('user_settings')
                .select('current_deck_id')
                .eq('user_id', uid)
                .maybeSingle();

            if (error) {
                console.error('user_settings error', error);
                return;
            }

            let effectiveDeckId: string | null = settings?.current_deck_id ?? null;
            let effectiveDeckName: string | null = null;

            // 2) If user has no current_deck_id, default to Brute 1000 Opening Challenge
            if (!effectiveDeckId) {
                const { data: bruteDeck, error: bruteErr } = await supabase
                    .from('decks')
                    .select('id, name')
                    .eq('name', 'BruteChess 1000 Opening Challenge')
                    .maybeSingle();

                if (!bruteErr && bruteDeck) {
                    effectiveDeckId = bruteDeck.id;
                    effectiveDeckName = bruteDeck.name;
                }
            }

            // 3) If we still have no deck id, keep null; otherwise resolve name
            if (effectiveDeckId && !effectiveDeckName) {
                const { data: deck, error: deckErr } = await supabase
                    .from('decks')
                    .select('name')
                    .eq('id', effectiveDeckId)
                    .maybeSingle();

                if (!deckErr && deck) {
                    effectiveDeckName = deck.name;
                }
            }

            setDeckId(effectiveDeckId);
            setDeckName(effectiveDeckName ?? null);
        })();
    }, [uid]);



    useEffect(() => {

        if (uid === undefined) return;

        try {
            const raw = localStorage.getItem(FILTERS_KEY)
            if (raw) {
                const f = JSON.parse(raw)
                if (typeof f?.dailyNewCap === 'number') setDailyCap(f.dailyNewCap)
                if (typeof f?.soundEnabled === 'boolean') setSoundEnabled(!!f.soundEnabled)
                if (typeof f?.studyFirst === 'boolean') setStudyFirst(!!f.studyFirst)
                if (typeof f?.timePressure === 'boolean') setTimePressure(!!f.timePressure)
            }
        } catch { }
        const onStorage = (e: StorageEvent) => {
            if (e.key === FILTERS_KEY) {
                try {
                    const f2 = JSON.parse(e.newValue || '{}')
                    if (typeof f2?.dailyNewCap === 'number') setDailyCap(f2.dailyNewCap)
                    if (typeof f2?.soundEnabled === 'boolean') setSoundEnabled(!!f2.soundEnabled)
                    if (typeof f2?.studyFirst === 'boolean') setStudyFirst(!!f2.studyFirst)
                    if (typeof f2?.timePressure === 'boolean') setTimePressure(!!f2.timePressure)
                } catch { }
            }
        }
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [FILTERS_KEY, uid]);

    useEffect(() => {
        function onRemoved(e: any) {
            const id: string | undefined = e?.detail?.id;
            if (!id) return;

            // 1) Drop any delayed retry for this id
            if (override && override.id === id) {
                setOverride(null);
                // also drop any delayed retry for this id
                setDelayed(prev => {
                    if (!prev[id]) return prev;
                    const copy = { ...prev };
                    delete copy[id];
                    return copy;
                });
            }

            // 2) Remove from the normal queue and fix the pointer
            setQueue(prev => {
                if (!prev) return prev;
                const idxToRemove = prev.findIndex(x => x.id === id);
                if (idxToRemove === -1) return prev;

                const next = prev.slice();
                next.splice(idxToRemove, 1);

                setIdx(cur => {
                    if (idxToRemove < cur) return Math.max(0, cur - 1); // removed before current → shift back
                    // if idxToRemove === cur, keep cur: the next item (formerly cur+1) slides into cur
                    if (cur >= next.length) return Math.max(0, next.length - 1); // removed the last element
                    return cur;
                });

                return next;
            });

            // 3) If it was one of today's queued NEW items, drop it from the queued-ids list
            const todayLocal = localDay3am(0);
            const queuedIds = readQueuedNewIds(todayLocal);
            if (queuedIds.includes(id)) {
                const nextIds = queuedIds.filter(x => x !== id);
                writeQueuedNewIds(todayLocal, nextIds);
                setQueuedNewCount(c => Math.max(0, c - 1));

                // NEW: also mark this id as "shown today" so we don't backfill the cap on reload
                const shown = readNewShown(todayLocal);
                if (!shown.has(id)) {
                    shown.add(id);
                    writeNewShown(todayLocal, shown);
                }

                // keep the tiles in sync with the fresh queued set
                recomputeTodayCounters(nextIds.length).catch(() => { });
            }

        }

        window.addEventListener('bc-remove-line', onRemoved);
        return () => window.removeEventListener('bc-remove-line', onRemoved);
    }, [recomputeTodayCounters]);


    useEffect(() => {
        if (!authReady) return;
        (async () => {

            const todayLocal = localDay3am(0);

            const { data: due } = await supabase
                .from('reviews')
                .select(
                    'line_id, interval_days, lines!inner(id, moves_san, line_name, openings(name, side, deck_id))'
                )
                .lte('due_on', todayLocal)
                .in('status', ['learning', 'review'])

            // Filter by deck in JS to avoid fiddly nested filters in PostgREST
            const dueFiltered = (due ?? []).filter((r: any) =>
                !deckId || r.lines?.openings?.deck_id === deckId
            )

            const recurring = dueFiltered.map((r: any) => ({
                id: r.lines.id,
                moves_san: r.lines.moves_san,
                isNew: false,
                interval_days: r.interval_days ?? 2,
                opening_name: r.lines.openings?.name ?? 'Opening',
                line_name: r.lines.line_name ?? null,
                player_side: (r.lines.openings?.side === 'black') ? 'black' : 'white',
            }))

            for (let i = recurring.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                    ;[recurring[i], recurring[j]] = [recurring[j], recurring[i]]
            }

            const { data: lines } = await supabase
                .from('lines')
                .select('id, moves_san, line_name, openings(name, side, deck_id)')
                .order('created_at', { ascending: false }) // newest first

            const linesFiltered = (lines ?? []).filter((l: any) =>
                !deckId || l.openings?.deck_id === deckId
            )


            const { data: my } = await supabase.from('reviews').select('line_id')
            const mySet = new Set((my ?? []).map((r: any) => r.line_id))
            const allNew = linesFiltered.filter((l: any) => !mySet.has(l.id));
            const shownToday = readNewShown(todayLocal);
            const remainingSlots = Math.max(0, (dailyCap ?? 10) - shownToday.size);

            const newItems: QueueItem[] = allNew
                .filter((l: any) => !mySet.has(l.id))
                .slice(0, remainingSlots)
                .map((l: any) => ({
                    id: l.id,
                    moves_san: l.moves_san,
                    isNew: true,
                    interval_days: null,
                    opening_name: l.openings?.name ?? 'Opening',
                    line_name: l.line_name ?? null,
                    player_side: (l.openings?.side === 'black') ? 'black' : 'white',
                }))

            setQueue([...recurring, ...newItems])
            setQueuedNewCount(newItems.length);
            writeQueuedNewIds(todayLocal, newItems.map(i => i.id));
            await recomputeTodayCounters(newItems.length)
        })()
    }, [authReady, dailyCap, deckId])

    // schedule a 7-minute retry for an item that had a mistake
    function scheduleRetry(item: QueueItem) {
        const readyAt = Date.now() + 7 * 60 * 1000
        setDelayed(prev => {
            // update if already scheduled; otherwise add
            const copy = { ...prev }
            copy[item.id] = { item, readyAt }
            mistakenThisSessionRef.current.add(item.id);
            return copy
        })

        if (item.isNew) {
            pendingNewToConsumeRef.current.add(item.id);
            // Defer counters so both “New” and “Recurring” update together on Next
            suppressRecomputeUntilNextRef.current = true;
        }
    }

    function flushPendingNewConsumption(): boolean {
        if (!pendingNewToConsumeRef.current.size) return false;

        const todayLocal = localDay3am(0);
        const shown = readNewShown(todayLocal);
        let changed = false;

        for (const id of pendingNewToConsumeRef.current) {
            if (!shown.has(id)) { shown.add(id); changed = true; }
        }
        pendingNewToConsumeRef.current.clear();

        if (changed) writeNewShown(todayLocal, shown);
        return changed;
    }



    // choose the next item according to your rules
    async function pickNext() {
        const changed = flushPendingNewConsumption();

        if (suppressRecomputeUntilNextRef.current || changed) {
            suppressRecomputeUntilNextRef.current = false;
            await recomputeTodayCounters(); // both tiles move together now
        }

        const now = Date.now()
        const entries = Object.values(delayed)


        // A) If any delayed is ready, let it cut in line (earliest first)
        {
            const ready = entries.filter(e => e.readyAt <= now)
            if (ready.length) {
                ready.sort((a, b) => a.readyAt - b.readyAt)
                const chosen = ready[0]
                setDelayed(prev => {
                    const copy = { ...prev }
                    delete copy[chosen.item.id]
                    return copy
                })

                setOverride(chosen.item)
                setAttemptKey(k => k + 1)
                return
            }
        }

        // B) No delayed ready. If we were showing a delayed item, clear the override.
        if (override) {
            setOverride(null)

            // C) If normals remain, advance to next normal
            if ((queue?.length ?? 0) > idx + 1) {
                setIdx(i => i + 1);
                setAttemptKey(k => k + 1);
                return;
            }
        }

        if ((queue?.length ?? 0) > idx + 1) {
            setIdx(i => i + 1);
            setAttemptKey(k => k + 1);
            return;
        }


        // D) No normals left → pick the delayed item with the *soonest* readyAt,
        //    even if not ready yet (per your rule).
        if (entries.length) {
            entries.sort((a, b) => a.readyAt - b.readyAt)
            const chosen = entries[0]
            setDelayed(prev => {
                const copy = { ...prev }
                delete copy[chosen.item.id]
                return copy
            })
            setOverride(chosen.item)
            setAttemptKey(k => k + 1)
            return
        }

        // E) Nothing left at all
        router.push('/drill/done')
    }


    const current = override ?? queue?.[idx] ?? null

    // app/drill/page.tsx
    function consumeNewAfterSuccess(lineId: string) {
        const todayLocal = localDay3am(0);
        const shown = readNewShown(todayLocal);
        if (!shown.has(lineId)) {
            shown.add(lineId);
            writeNewShown(todayLocal, shown);
        }
        // keep the counter in sync
        recomputeTodayCounters().catch(() => { });
    }

    useDrillTimeTracker(uid, localDay3am);



    return (
        <Protected>
            <div className="relative min-h-screen">
                {/* Invisible background click layer */}
               <div
                    className="fixed inset-0 z-0"
                    onClick={() => {
                        if (!filtersOpen && !statsOpen) drillRef.current?.nextIfAllowed();
                    }}
                />

                {/* All interactive content sits above the click layer */}
                <div
                    className="relative z-10 space-y-4"
                    onClick={() => {
                        if (!filtersOpen && !statsOpen) drillRef.current?.nextIfAllowed();
                    }}
                    {...(filtersOpen || statsOpen ? { inert: true as any, 'aria-hidden': true } : {})}
                >


                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold">Drill</h1>
                            {deckName && (
                                <div className="text-sm text-gray-500">
                                    Deck:{' '}
                                    <span className="font-medium">
                                        {deckName}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Right controls */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Filter */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setFiltersOpen(true); }}
                                className={toolBtn}
                                title="Filter (F)"
                            >
                                {/* lucide Sliders */}
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line>
                                    <line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line>
                                    <line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line>
                                    <circle cx="12" cy="4" r="2"></circle><circle cx="8" cy="12" r="2"></circle><circle cx="16" cy="20" r="2"></circle>
                                </svg>
                                <span>Filter</span>
                            </button>

                            {/* Stats */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setStatsOpen(true); }}
                                aria-label="Open stats"
                                className={iconOnlyBtn}
                                title="Stats (S)"
                            >
                                <BarChart3 className="w-4 h-4" />
                            </button>
                        </div>

                </div>

                {!current && <div>Loading... (If openings do not load, you have finished all openings for today)</div>}
                {current && (
                    <OpeningDrill
                        ref={drillRef}
                        attemptKey={attemptKey}
                        item={current}
                        onNext={pickNext}
                        onMistake={scheduleRetry}
                        onPersist={handlePersist}
                        wasMistakenThisSession={mistakenThisSessionRef.current.has(current.id)}
                        soundEnabled={soundEnabled}
                        onConsumeNew={consumeNewAfterSuccess}
                        newDue={newDue}
                        recurringDue={recurringDue}
                        studyOpeningsFirst={studyFirst}
                        timePressure={timePressure}
                    />
                )}



                </div>
            </div>
            {mounted && achievementBanner && createPortal(
                <div
                    className="fixed top-20 right-4 z-[120] flex max-w-xs items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm shadow-lg"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="mt-0.5">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                            ★
                        </span>
                    </div>
                    <div className="flex-1">
                        <div className="font-semibold text-emerald-800">
                            Achievement unlocked!
                        </div>
                        <div className="text-emerald-900">
                            You unlocked{' '}
                            <span className="font-semibold">
                                {achievementBanner.label}
                            </span>
                            .
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ml-2 text-emerald-700 hover:text-emerald-900"
                        onClick={e => {
                            e.stopPropagation()
                            setAchievementBanner(null)
                        }}
                        aria-label="Dismiss achievement notification"
                    >
                        ×
                    </button>
                </div>,
                document.body
            )}

            {mounted && filtersOpen && createPortal(
                // No extra backdrop here so it looks exactly like your current Filter;
                // we only lift it above the header.
                <div className="fixed inset-0 z-[105]" onClick={() => setFiltersOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <DrillFilters
                            open
                            onClose={() => setFiltersOpen(false)}
                            storageKey={FILTERS_KEY}
                            onApply={(f) => {
                                setDailyCap(f.dailyNewCap ?? 10);
                                setSoundEnabled(!!f.soundEnabled);
                                setStudyFirst(!!f.studyFirst);
                                setTimePressure(!!f.timePressure);

                            }}
                        />
                    </div>
                </div>,
                document.body
            )}

            {mounted && statsOpen && createPortal(
                <>
                    {/* Backdrop (no blur; matches Filter’s feel) */}
                    <div
                        className="fixed inset-0 z-[100] bg-black/25"
                        onClick={() => setStatsOpen(false)}
                    />
                    {/* Slide-in panel above everything, including the sticky header */}
                    <div
                        className="fixed inset-y-0 right-0 z-[110]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <DrillStatsPanel open onClose={() => setStatsOpen(false)} />
                    </div>
                </>,
                document.body
            )}

        </Protected>
    )
}

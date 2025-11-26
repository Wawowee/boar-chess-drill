'use client'
import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Chess } from 'chess.js'
import type { Square, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { scheduleNext } from '@/lib/scheduler'
import { supabase } from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js';

const btnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

const btnVariants = {
    primary:
        btnBase +
        " px-3 py-2 border shadow-sm " +
        "bg-orange-600 text-white border-orange-600 hover:bg-orange-500 " +
        "focus-visible:ring-orange-500",
    secondary:
        btnBase +
        " px-3 py-2 border shadow-sm " +
        "bg-white text-gray-900 border-gray-200 hover:bg-gray-50 " +
        "focus-visible:ring-gray-300",
    ghost:
        btnBase +
        " px-2 py-2 border shadow-sm " +
        "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 " +
        "focus-visible:ring-gray-300",
    subtle:
        btnBase +
        " px-3 py-2 border shadow-sm " +
        "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200 " +
        "focus-visible:ring-gray-300",
};

// add after other imports
type Resource = {
    id: string
    kind: 'youtube' | 'image' | 'link' | 'text'
    title: string | null
    url: string | null
    content: string | null
    sort_order: number | null
}


type Props = {
    attemptKey?: number;
    item: {
        id: string
        moves_san: string[]
        isNew: boolean
        interval_days: number | null
        opening_name: string
        line_name?: string | null
        player_side: 'white' | 'black'
        
    }
    onNext: () => void
    onMistake?: (item: {
        id: string
        moves_san: string[]
        isNew: boolean
        interval_days: number | null
        opening_name: string
        line_name?: string | null
        player_side: 'white' | 'black'
        
    }) => void
    onPersist?: (p: Promise<void>) => void
    wasMistakenThisSession?: boolean
    soundEnabled?: boolean;
    onConsumeNew?: (id: string) => void
    newDue?: number
    recurringDue?: number
    studyOpeningsFirst?: boolean;
    timePressure?: boolean;
}

export type OpeningDrillHandle = {
    nextIfAllowed: () => void;
};



const OpeningDrill = forwardRef<OpeningDrillHandle, Props>(function OpeningDrill(
    { item, onNext, onMistake, onPersist, wasMistakenThisSession, attemptKey, soundEnabled = true, onConsumeNew, newDue, recurringDue, studyOpeningsFirst = false, timePressure = false, }: Props,
    ref
) {
    const [flash, setFlash] = useState<null | 'correct' | 'incorrect'>(null)
    const [idx, setIdx] = useState(0)
    const [canScrub, setCanScrub] = useState(false)
    const [hadMistakes, setHadMistakes] = useState(false)
    const [finished, setFinished] = useState(false)
    const gameRef = useRef(new Chess())
    const savedRef = useRef(false)     // <- prevents double saves
    const [uid, setUid] = useState<string | null>(null);
    const [side, setSide] = useState<'white' | 'black'>('white')
    const total = item?.moves_san?.length ?? 0
    const [labelIsNew, setLabelIsNew] = useState(item.isNew)
    const priorFailTodayRef = useRef(false);
    const deferPassSaveRef = useRef(false);
    const [usedShowSolution, setUsedShowSolution] = useState(false);
    const canGoNext = finished;
    const steadyGreen = finished && !hadMistakes;
    const [selected, setSelected] = useState<Square | null>(null)
    const [targets, setTargets] = useState<Square[]>([])
    const removingRef = useRef(false);
    const moveSndRef = useRef<HTMLAudioElement | null>(null);
    const capSndRef = useRef<HTMLAudioElement | null>(null);
    const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const lastLineIdRef = useRef<string | null>(null)
    const saveInFlightRef = useRef<Promise<void> | null>(null);
    const firstWhiteTimerRef = useRef<number | null>(null)
    const [animMs, setAnimMs] = useState(300)
    const selectGlow = 'inset 0 0 0 3px rgba(80,180,255,.85)';
    const targetOutline = '2px solid rgba(80,180,255,.55)';
    const [resources, setResources] = useState<Resource[]>([])
    const totalWhiteMoves = Math.ceil(total / 2)
    const whiteMovesDone = Math.min(Math.ceil(idx / 2), totalWhiteMoves)
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        // Clear when switching lines or while not finished
        if (!finished) { setResources([]); return; }

        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('opening_resources')
                .select('id, kind, title, url, content, sort_order')
                .eq('line_id', item.id)
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });

            if (error || cancelled) return;
            setResources((data ?? []) as Resource[]);
        })();

        return () => { cancelled = true; }
    }, [finished, item.id]);


    useEffect(() => {
        return () => {
            if (firstWhiteTimerRef.current !== null) {
                clearTimeout(firstWhiteTimerRef.current)
                firstWhiteTimerRef.current = null
            }
        }
    }, [item.id])


    useEffect(() => {
        // lazy init once on mount (mobile browsers require user interaction first, that’s fine)
        moveSndRef.current = new Audio('/sounds/move.mp3');
        capSndRef.current = new Audio('/sounds/capture.mp3');
        if (moveSndRef.current) { moveSndRef.current.preload = 'auto'; moveSndRef.current.volume = 0.7; }
        if (capSndRef.current) { capSndRef.current.preload = 'auto'; capSndRef.current.volume = 0.15; }
    }, []);

    useImperativeHandle(ref, () => ({
        nextIfAllowed() {
            if (canGoNext) {
                void saveReview('next_opening', usedShowSolution);
            }
        },
    }), [canGoNext, usedShowSolution]);


    function YouTubeEmbed({ url }: { url: string }) {
        // accept full links; extract video id if needed
        const idMatch = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
        const vid = idMatch ? idMatch[1] : url;
        const src = `https://www.youtube.com/embed/${vid}`;
        return (
            <div className="aspect-video w-full rounded-lg overflow-hidden border">
                <iframe
                    className="w-full h-full"
                    src={src}
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        )
    }

    function playMoveSound(captured: boolean) {
        if (!soundEnabled) return;
        const el = captured ? capSndRef.current : moveSndRef.current;
        // Avoid stacking too many parallel plays
        if (!el) return;
        try { el.currentTime = 0; void el.play(); } catch { }
    }

    function localDay3am(offsetDays = 0): string {
        const d = new Date();
        // shift the clock back 3 hours to implement the pivot
        d.setHours(d.getHours() - 3);
        // move by offsetDays after pivoting
        d.setDate(d.getDate() + offsetDays);
        return d.toLocaleDateString('en-CA', { timeZone: USER_TZ }); // YYYY-MM-DD
    }

    function startOfToday3amISO(): string {
        // local 3AM pivot → build an ISO string usable in .gte('seen_at', ...)
        const now = new Date()
        const d = new Date(now)
        d.setHours(3, 0, 0, 0)
        // if it's before 3AM local now, the "today 3AM" window started yesterday at 3AM
        if (now.getHours() < 3 || (now.getHours() === 3 && (now.getMinutes() === 0 && now.getSeconds() === 0 && now.getMilliseconds() === 0))) {
            d.setDate(d.getDate() - 1)
        }
        return d.toISOString()
    }

    async function hadFailEarlierToday(u: string, lineId: string): Promise<boolean> {
        const since = startOfToday3amISO()
        const { count, error } = await supabase
            .from('review_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', u)
            .eq('line_id', lineId)
            .eq('result', 'fail')
            .gte('seen_at', since)
        if (error) {
            // be safe: if query fails, fall back to ref
            return priorFailTodayRef.current
        }
        return (count ?? 0) > 0
    }



    useEffect(() => {
        setLabelIsNew(item.isNew && !wasMistakenThisSession)
    }, [item.id, wasMistakenThisSession])

    useEffect(() => {
        if (!finished && idx >= total) {
            onFinishedNow()   // safe: guarded by 'finished' + your completedOnceRef
        }
    }, [idx, total, finished])


    useEffect(() => {
        let mounted = true;
        (async () => {
            const { data } = await supabase.auth.getUser(); // data: { user: User | null }
            if (!mounted) return;
            setUid(data.user?.id ?? null);
        })();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (attemptKey === undefined) return
        // Soft reset for a new attempt of the SAME line:
        priorFailTodayRef.current = priorFailTodayRef.current || !!wasMistakenThisSession;
        setSide(item.player_side)
        setFlash(null)
        setIdx(0)
        setCanScrub(false)
        setHadMistakes(false)
        setFinished(false)
        setUsedShowSolution(false);
        setSelected(null);
        setTargets([]);

        removingRef.current = false
        deferPassSaveRef.current = false
        savedRef.current = false

        savedRef.current = false
        try { gameRef.current.reset() } catch { }
        // Do NOT change side or label here — those are per-line, not per-attempt
    }, [attemptKey])

    // Reset per new item
    useEffect(() => {

        if (lastLineIdRef.current !== item.id) {
            priorFailTodayRef.current = !!wasMistakenThisSession
        } else {
            // same line resurfaced: DO NOT clear a previously-set true
            priorFailTodayRef.current = priorFailTodayRef.current || !!wasMistakenThisSession
        }
        lastLineIdRef.current = item.id
        setSide(item.player_side)
        setFlash(null); setIdx(0); setCanScrub(false); setHadMistakes(false); setFinished(false)
        setUsedShowSolution(false);
        setSelected(null);
        setTargets([]);
        savedRef.current = false

        removingRef.current = false
        deferPassSaveRef.current = false
        savedRef.current = false

        gameRef.current.reset()
    }, [item?.id])

    useEffect(() => {
        if (!studyOpeningsFirst) return
        if (!item.isNew) return
        if (wasMistakenThisSession) return

        // Only auto-show when the line first appears
        if (!finished && idx === 0) {
            onShowSolution()
        }
    }, [item.id, studyOpeningsFirst, item.isNew, wasMistakenThisSession, finished, idx])

    // Time Pressure: start/reset 30s timer for recurring lines only
    useEffect(() => {
        // Only apply to recurring openings from other days (isNew === false)
        if (!timePressure || item.isNew || finished) {
            setTimeLeft(null);
            return;
        }

        // New recurring card (or new attempt): start at 30
        setTimeLeft(30);
    }, [item.id, attemptKey, timePressure, item.isNew, finished]);

    useEffect(() => {
        // Only tick when active
        if (!timePressure || item.isNew || finished) return;
        if (timeLeft == null) return;
        if (timeLeft <= 0) return; // already hit zero, Show Solution will have run

        const id = window.setInterval(() => {
            setTimeLeft(prev => {
                if (prev == null) return prev;
                if (prev <= 1) {
                    clearInterval(id);
                    // act as if Show Solution was pressed
                    if (!finished) {
                        onShowSolution();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timePressure, item.isNew, finished, timeLeft]);


    const fenForIdx = useMemo(() => {
        const g = new Chess()
        const arr = item?.moves_san ?? []
        for (let i = 0; i < idx && i < arr.length; i++) g.move(arr[i])
        return g.fen()
    }, [idx, item])

    useEffect(() => {
        gameRef.current.load(fenForIdx)
    }, [fenForIdx])

    // Is it the player's turn?
    const isPlayerTurn = useMemo(() => {
        // White moves on 0,2,4,... ; Black on 1,3,5,...
        return (idx % 2 === 0) === (side === 'white')
    }, [idx, side])

    // Auto-move opponent
    useEffect(() => {
        const arr = item?.moves_san ?? [];
        if (!finished && !isPlayerTurn && idx < arr.length) {

            // Special case: first move on a Black line — show the start for a beat
            if (side === 'black' && idx === 0) {
                if (firstWhiteTimerRef.current == null) {
                    firstWhiteTimerRef.current = window.setTimeout(() => {
                        // Re-check conditions at fire time to avoid stale actions
                        if (!finished && !isPlayerTurn && side === 'black' && idx === 0 && arr.length > 0) {
                            // Let the board animate this first move via fenForIdx
                            setAnimMs(500)           // slower just for the first move (tweak to taste)
                            setIdx(1)                // triggers fenForIdx -> smooth animation
                            // optional: play the sound mid-animation so it feels synced
                            window.setTimeout(() => { try { playMoveSound(false) } catch { } }, 300)
                            // restore default speed after the move
                            window.setTimeout(() => setAnimMs(300), 520)
                        }
                        firstWhiteTimerRef.current = null
                    }, 50) // tweak 120–250ms to taste
                }
                return // defer immediate auto-move
            }

            const san = arr[idx];

            // Apply opponent move and capture its metadata
            const mv = gameRef.current.move(san);   // mv is a chess.js Move or null
            if (mv) {
                // play capture/move sound based on whether a piece was taken
                playMoveSound(!!(mv as any).captured);
                setIdx(i => i + 1);
            }
        }
    }, [isPlayerTurn, idx, finished, item, soundEnabled]);


    async function ensureUid(): Promise<string | null> {
        if (uid) return uid
        const { data } = await supabase.auth.getUser()
        const u = data.user?.id ?? null
        if (u) setUid(u)
        return u
    }

    // --- CORE: persist a completion exactly once ---
    async function autoSaveCompletion() {
        if (savedRef.current || removingRef.current) return;
        const run = async () => {
            const u = await ensureUid(); if (!u) return

            const treatAsPass = !hadMistakes

            if (
                treatAsPass &&
                !item.isNew                   // recurring

            ) {
                const failToday = await hadFailEarlierToday(u, item.id)
                if (failToday) {
                    deferPassSaveRef.current = true
                    return // don't write yet; saveReview will handle correct 2–3 days
                }
            }


            if (treatAsPass) {
                const result = scheduleNext({
                    isNew: item.isNew,
                    hadMistakes: false,
                    clickedShowSolution: false,
                    wasRecurring: !item.isNew,
                    intervalDays: item.interval_days,
                    userChoice: 'next_opening',
                    hadPriorFailToday: false
                })
                const dueOn = localDay3am(result.todayOffset ?? 0);

                await supabase.from('reviews').upsert({
                    user_id: u,
                    line_id: item.id,
                    status: 'review',
                    due_on: dueOn,
                    interval_days: (result as any).intervalDays ?? 2,
                    last_result: 'pass',
                    last_seen_at: new Date().toISOString(),
                })

                await supabase.from('review_events').insert({
                    user_id: u,
                    line_id: item.id,
                    result: 'pass',
                })


            } else {
                await supabase.from('reviews').upsert({
                    user_id: u,
                    line_id: item.id,
                    status: 'learning',
                    due_on: localDay3am(0),
                    interval_days: 0,
                    last_result: 'fail',
                    last_seen_at: new Date().toISOString(),
                })
                await supabase.from('review_events').insert({
                    user_id: u,
                    line_id: item.id,
                    result: 'fail',
                    // seen_at defaults to now() server-side; you can omit it
                })

            }  // if want counters to update at same time as completed, add )() on this line and add ( before async. E.g. const run = (async

            savedRef.current = true
        }

        const p = run()
        saveInFlightRef.current = p;
        onPersist?.(p)   // <-- tell the parent “a save started”; parent will refresh counters when it resolves
        try { await p; } finally { saveInFlightRef.current = null; }
    }

    // Save on last correct move
    function onFinishedNow() {
        setCanScrub(true)
        setFinished(true)
        void autoSaveCompletion()      // fire & forget; buttons still work
    }

    function onBack() {
        if (!canScrub) return
        const g = new Chess()
        const arr = item?.moves_san ?? []
        const k = Math.max(0, idx - 1)
        for (let i = 0; i < k && i < arr.length; i++) g.move(arr[i])
        gameRef.current.load(g.fen())
        setIdx(k)
    }

    function onForward() {
        if (!canScrub) return
        const arr = item?.moves_san ?? []
        if (idx < arr.length) {
            const g = new Chess(gameRef.current.fen())
            g.move(arr[idx])
            gameRef.current.load(g.fen())
            setIdx(i => i + 1)
        }
    }

    function onShowSolution() {
        if (finished) return
        if (!hadMistakes) {
            // mark: this line failed at least once today
            priorFailTodayRef.current = true;
            onMistake?.(item);                  // schedule today (your 7-min retry) & mark session set
        } else {
            onMistake?.(item)
        }
        setHadMistakes(true)
        setLabelIsNew(false)
        setCanScrub(true)
        setFinished(true)
        setUsedShowSolution(true);
        // Optional: if you want “show solution” to immediately mark fail, call autoSaveCompletion()
        // but since we default to pass, we leave it for manual buttons.
        ; (async () => {
            try {
                const u = await ensureUid(); if (!u) return
                await supabase.from('review_events').insert({
                    user_id: u,
                    line_id: item.id,
                    result: 'fail',
                })
            } catch { }
        })()
    }

    // when a wrong move is attempted:
    // add near other state

    function getLegalTargets(from: Square): Square[] {
        try {
            const moves = gameRef.current.moves({ square: from, verbose: true }) as Move[]
            return moves.map(m => m.to as Square)
        } catch {
            return []
        }
    }

    function handleMove(from: Square, to: Square): boolean {
        const arr = item?.moves_san ?? []
        if (finished || !isPlayerTurn || canScrub) return false

        const move = gameRef.current.move({ from, to, promotion: 'q' })
        if (!move) return false

        const sanTried = move.san
        const sanExpected = arr[idx]

        if (sanTried === sanExpected) {
            const nextIdx = idx + 1
            playMoveSound(!!(move as any).captured);
            setIdx(nextIdx)
            setSelected(null)
            setTargets([])
            setFlash('correct')
            setTimeout(() => setFlash(null), 250)
            
            // if (nextIdx >= arr.length) onFinishedNow()
            return true
        } else {
            gameRef.current.undo()
            if (!hadMistakes) {
                priorFailTodayRef.current = true
                onMistake?.(item)
            }
            setHadMistakes(true)
            setLabelIsNew(false)
            setFlash('incorrect')
            setTimeout(() => setFlash(null), 350)
            return false
        }
    }

    function onPieceDrop(source: Square, target: Square) {
        return handleMove(source, target)
    }

    function onSquareClick(square: Square) {
        if (finished || !isPlayerTurn || canScrub) return

        if (!selected) {
            const piece = gameRef.current.get(square) // Square typed
            if (!piece) return
            setSelected(square)
            setTargets(getLegalTargets(square))
            return
        }

        // change selection if clicking another friendly piece
        if (selected !== square) {
            const piece = gameRef.current.get(square)
            const selPiece = gameRef.current.get(selected)
            if (piece && selPiece && piece.color === selPiece.color) {
                setSelected(square)
                setTargets(getLegalTargets(square))
                return
            }
        }

        // attempt move if legal
        if (targets.includes(square)) {
            handleMove(selected, square)
        }
        setSelected(null)
        setTargets([])
    }



    // Safety net: if user navigates away after finishing but before clicking anything, persist once.
    useEffect(() => {
        if (!finished) return
        const onBeforeUnload = () => { if (!savedRef.current && !deferPassSaveRef.current) void autoSaveCompletion() }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload)
            if (!savedRef.current && !deferPassSaveRef.current) void autoSaveCompletion()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finished])

    // Manual save that also navigates the queue    const u = await ensureUid(); if (!u) return
    async function saveReview(
        choice: 'repeat_again' | 'next_opening',
        clickedShowSolution: boolean
    ) {

        if (removingRef.current) return;


        const u = await ensureUid(); if (!u) return
        const cleanThisAttempt = !hadMistakes && !clickedShowSolution;

        const wasRecurring = (!item.isNew) || (item.interval_days != null);
        const failToday = await hadFailEarlierToday(u, item.id);


        const ctx = {
            isNew: !wasRecurring,
            hadMistakes,
            wasRecurring,
            clickedShowSolution,
            intervalDays: item.interval_days,
            userChoice: choice,
            hadPriorFailToday: wasRecurring && failToday && cleanThisAttempt && choice === 'next_opening'
        } as const;

        const result = scheduleNext(ctx);

        const isPass = !('reinsertToday' in result && result.reinsertToday);


        if (isPass && ctx.isNew) {
            // only count new cards when the attempt finished cleanly (no reinsert)
            onConsumeNew?.(item.id);
        }


        // Create ONE promise for the DB write
        const p = (async () => {
            if ('reinsertToday' in result && result.reinsertToday) {
                // fail/try again today
                await supabase.from('reviews').upsert({
                    user_id: u,
                    line_id: item.id,
                    status: 'learning',
                    due_on: localDay3am(0),
                    interval_days: 0,
                    last_result: 'fail',
                    last_seen_at: new Date().toISOString(),
                });
            } else {
                // pass / scheduled review
                const dueOn = localDay3am(result.todayOffset ?? 0);

                await supabase.from('reviews').upsert({
                    user_id: u,
                    line_id: item.id,
                    status: 'review',
                    due_on: dueOn,
                    interval_days: (result as any).intervalDays ?? 2,
                    last_result: ('decCounter' in result) ? 'pass' : 'fail',
                    last_seen_at: new Date().toISOString(),
                });
            }
            savedRef.current = true;
        })();

        // Tell parent a save started; it will refresh counters when this resolves
        onPersist?.(p);

        // Wait for DB commit before changing screens/state
        await p;

        // Continue flow
        // const isReinsertToday = 'reinsertToday' in result && result.reinsertToday;
        if (choice === 'repeat_again') {
            setIdx(0); setHadMistakes(false); setFinished(false); setCanScrub(false);
            gameRef.current.reset();
        } else {

            if ('reinsertToday' in result && result.reinsertToday) {
                setHadMistakes(false);                 // <-- IMPORTANT
            }
            onNext();
        }
    }



    return (
        <div className="grid grid-cols-12 gap-6">
            <aside className="col-span-4">
                {/* One card, flex column, so controls can sit at the bottom */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                        "relative flex flex-col p-3 rounded-xl shadow border sticky top-20 self-start bg-white",
                        {
                            "border-green-500": steadyGreen,                    // keep border green at clean finish
                            "border-rose-300": !steadyGreen && flash === "incorrect", // optional: red border during wrong flash
                        }
                    )}
                >
                    {flash && (
                        <div
                            className={clsx(
                                "absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200",
                                flash === "correct" ? "bg-green-50" : "bg-red-50"
                            )}
                        />
                    )}
                    <div className="relative z-10">
                    {/* Header/info (no inner bg wrapper) */}
                    <div className="flex items-center justify-between">
                        <div className="text-xl font-semibold">{item.opening_name}</div>
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${labelIsNew
                                    ? "bg-blue-50 border-blue-200 text-blue-700"
                                    : "bg-amber-50 border-amber-200 text-amber-700"
                                }`}
                        >
                            {labelIsNew ? "New" : "Review"}
                        </span>
                    </div>

                    {item.line_name && (
                        <div className="text-xl font-semibold mt-0.5">{item.line_name}</div>
                    )}

                        <div className="mt-3 text-sm">
                            Move {whiteMovesDone} / {totalWhiteMoves}
                        </div>
                    {finished && savedRef.current && (
                        <div className="mt-1 text-xs text-gray-700">Saved ✓</div>
                    )}

                    <div
                        className={clsx(
                            "mt-2 space-y-0.5 text-sm",
                            finished && savedRef.current ? "pt-0" : "pt-1"
                        )}
                    >
                        <div className="text-gray-800">
                            <span className="font-medium">New Due Today:</span> {newDue ?? 0}
                        </div>
                        <div className="text-gray-800">
                            <span className="font-medium">Reviews Due Today:</span> {recurringDue ?? 0}
                        </div>
                    </div>


                    {/* Divider before controls */}
                    <div className="mt-4 pt-3 border-t" />

                    {/* Controls directly under Saved */}
                    <div className="mt-3 space-y-3">
                        {/* Row 1: Show Solution + Next Opening */}
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={finished}
                                    onClick={onShowSolution}
                                    className={clsx(
                                        btnVariants.secondary,
                                        'min-w-[140px]', // 👈 added
                                        finished && 'opacity-50 cursor-not-allowed',
                                    )}
                                    aria-disabled={finished}
                                    title={
                                        finished
                                            ? 'Already completed / solution shown'
                                            : 'Show Solution'
                                    }
                                >
                                    Show Solution
                                </button>

                                <button
                                    disabled={!canGoNext}
                                    onClick={() => saveReview('next_opening', usedShowSolution)}
                                    className={clsx(
                                        btnVariants.primary,
                                        'min-w-[140px]', // 👈 added (same as above)
                                        !canGoNext && 'opacity-50 cursor-not-allowed',
                                    )}
                                    aria-disabled={!canGoNext}
                                    title={
                                        !canGoNext
                                            ? 'Complete the line or click Show Solution first'
                                            : 'Next Opening'
                                    }
                                >
                                    Onward!
                                </button>
                            </div>


                        {/* Row 2: centered Back / Forward */}
                        {canScrub && (
                            <div className="flex justify-center gap-2">
                                <button
                                    onClick={onBack}
                                    className={btnVariants.subtle}
                                >
                                    ◀ Back
                                </button>
                                <button
                                    onClick={onForward}
                                    className={btnVariants.subtle}
                                >
                                    Forward ▶
                                </button>
                            </div>
                        )}
                        <div className="flex justify-end">
                            <button
                                onClick={async () => {
                                    removingRef.current = true;
                                    savedRef.current = true;
                                    deferPassSaveRef.current = true;
                                    const pending = saveInFlightRef.current; if (pending) { try { await pending; } catch { } }
                                    const u = await ensureUid(); if (!u) return;
                                    const p = supabase.from('reviews').upsert({
                                        user_id: u, line_id: item.id, status: 'removed',
                                        due_on: null, interval_days: null, last_result: null,
                                        last_seen_at: new Date().toISOString(),
                                    });
                                    onPersist?.(p);
                                    try {
                                        await p;
                                        await supabase.from('reviews')
                                            .update({ status: 'removed', due_on: null, interval_days: null, last_result: null })
                                            .eq('user_id', u).eq('line_id', item.id);
                                    } finally {
                                        window.dispatchEvent(new CustomEvent('bc-remove-line', { detail: { id: item.id } }));
                                        onNext();
                                    }
                                }}
                                className={btnVariants.ghost}
                                aria-label="Remove opening"
                                title="Remove opening"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                    </div>

                   </div>
                </div>
                {canGoNext && (
                    <div className="mt-2 text-center text-xs text-black/80 pointer-events-none select-none">
                         Click anywhere in the background to proceed &gt;&gt;&gt;
                    </div>
                )}

                {/* Resources (only after ready to advance) */}
                {finished && resources.length > 0 && (
                    <div
                        className="mt-4 space-y-3"
                        onClick={(e) => e.stopPropagation()} // don't trigger background-next on clicks
                    >
                        <div className="text-sm font-semibold text-gray-800">Resources</div>
                        {resources.map(r => (
                            <div key={r.id} className="rounded-lg border bg-white p-3 shadow-sm">
                                {r.title && <div className="text-sm font-medium mb-1">{r.title}</div>}

                                {r.kind === 'text' && (
                                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</div>
                                )}

                                {r.kind === 'link' && r.url && (
                                    <a className="text-sm text-blue-600 hover:underline break-all" href={r.url} target="_blank" rel="noreferrer">
                                        {r.url}
                                    </a>
                                )}

                                {r.kind === 'image' && r.url && (
                                    <img src={r.url} alt={r.title ?? 'image'} className="w-full rounded border" />
                                )}

                                {r.kind === 'youtube' && r.url && (
                                    <YouTubeEmbed url={r.url} />
                                )}
                            </div>
                        ))}
                    </div>
                )}

            </aside>


            <main className="col-span-8">
                <div onClick={(e) => e.stopPropagation()}>
                    {timePressure && !item.isNew && !finished && timeLeft !== null && (
                        <div className="mb-2 text-sm font-medium text-red-600">
                            Time left: {timeLeft}s
                        </div>
                    )}
                <Chessboard
                    position={gameRef.current.fen()}
                    onPieceDrop={onPieceDrop}
                    onSquareClick={onSquareClick}
                        customLightSquareStyle={{ backgroundColor: 'var(--bc-board-light)' }}
                        customDarkSquareStyle={{ backgroundColor: 'var(--bc-board-dark)' }}
                        customNotationStyle={{ color: 'var(--bc-notation)' }}
                    customBoardStyle={{
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,.08)',
                        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
                    }}
                    showBoardNotation
                    customSquareStyles={{

                        ...(selected ? { [selected]: { boxShadow: selectGlow, borderRadius: 6 } } : {}),
                        ...targets.reduce((acc, sq) => {
                            acc[sq] = { outline: targetOutline, borderRadius: 6 };
                            return acc;
                        }, {} as Record<string, React.CSSProperties>),
                    }}
                    arePiecesDraggable={!canScrub && !finished}
                    boardOrientation={side}
                    animationDuration={300}
                    />
                </div>
            </main>
        </div>
    )
});
export default OpeningDrill;

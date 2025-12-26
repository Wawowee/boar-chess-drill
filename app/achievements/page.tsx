'use client'

import Protected from '@/app/protected'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState } from 'react'

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
type Deck = { id: string; name: string }

const USER_TZ =
  (typeof Intl !== 'undefined' &&
    Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  'UTC'
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

function computeLongestPassStreak(events: EventRow[]) {
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

type Achievement = {
  id: string
  label: string
  unlocked: boolean
  detail?: string
  medalColor?: string   // Tailwind bg-* class when unlocked
  medalLabel?: string   // e.g. "Red Medal"
}


function AchievementsSection({
  title,
  achievements,
}: {
  title: string
  achievements: Achievement[]
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {achievements.map(a => (
          <div
            key={a.id}
className={`rounded-lg border p-3 text-sm flex flex-col gap-1 transition
  ${
    a.unlocked
      ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
      : 'bg-white/60 border-gray-200 text-gray-400'
  }
`}

          >
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-2">
    {/* Medal icon */}
    {a.medalColor && (
      <div
        className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition
          ${
            a.unlocked
              ? `${a.medalColor} border-yellow-200`
              : 'bg-gray-300 border-gray-400 opacity-60'
          }
        `}
        aria-label={a.medalLabel}
        title={a.medalLabel}
      >
        {/* Small inner circle to look more like a medal */}
        <div className="w-3 h-3 rounded-full bg-white/60" />
      </div>
    )}
    <span className="font-medium">{a.label}</span>
  </div>

<span
  className={`text-[11px] uppercase tracking-wide ${
    a.unlocked ? 'text-amber-700' : 'text-gray-400'
  }`}
>
  {a.unlocked ? 'Unlocked' : 'Locked'}
</span>

</div>

            {a.detail && (
              <div className="text-[11px] text-gray-500">
                {a.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AchievementsPage() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [lines, setLines] = useState<LineWithSide[] | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const myUid = auth.user?.id
      if (!myUid) {
        if (!cancelled) setLoading(false)
        return
      }

      const [
        { data: reviewData, error: revErr },
        { data: ev, error: evErr },
        { data: ls, error: lsErr },
        { data: deckRows, error: deckErr },
        { data: settings, error: settingsErr },
      ] = await Promise.all([
        supabase
          .from('reviews')
          .select(
            'line_id,last_result,last_seen_at,interval_days,due_on,status',
          )
          .eq('user_id', myUid),
        supabase
          .from('review_events')
          .select('line_id,result,seen_at')
          .eq('user_id', myUid),
        supabase
          .from('lines')
          .select('id,is_active,line_name,openings(name,side,deck_id)'),
        supabase
              .from('decks')
              .select('id,name')
              .eq('is_hidden', false)
              .order('created_at', { ascending: true }),
        supabase
          .from('user_settings')
          .select('current_deck_id')
          .eq('user_id', myUid)
          .maybeSingle(),
      ])

      if (cancelled) return

      if (!revErr) setRows((reviewData ?? []) as ReviewRow[])
      if (!evErr) setEvents((ev ?? []) as EventRow[])
      if (!lsErr) setLines((ls ?? []) as LineWithSide[])
      if (!deckErr) setDecks((deckRows ?? []) as Deck[])

        const currentDeckId = settingsErr ? null : (settings?.current_deck_id ?? null)

        const visibleDeckRows = (deckRows ?? []) as Deck[]
        const currentIsVisible = !!currentDeckId && visibleDeckRows.some(d => d.id === currentDeckId)

        const defaultDeckId = currentIsVisible
            ? currentDeckId
            : (visibleDeckRows[0]?.id ?? null)

        setSelectedDeckId(defaultDeckId)



      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Filter by deck
const linesFiltered = useMemo(() => {
  if (!lines) return null
  if (!selectedDeckId) return null
  return lines.filter(l => l.openings?.deck_id === selectedDeckId)
}, [lines, selectedDeckId])


  const lineIdSet = useMemo(() => {
    if (!linesFiltered) return null
    return new Set(linesFiltered.map(l => l.id))
  }, [linesFiltered])

  const rowsFiltered = useMemo(() => {
    if (!rows) return null
    if (!lineIdSet) return rows
    return rows.filter(r => lineIdSet.has(r.line_id))
  }, [rows, lineIdSet])

  const eventsFiltered = useMemo(() => {
    if (!events) return null
    if (!lineIdSet) return events
    return events.filter(e => lineIdSet.has(e.line_id))
  }, [events, lineIdSet])

  // Core stats per deck
  const linesTotal = useMemo(
    () => (linesFiltered ?? []).filter(l => l.is_active).length,
    [linesFiltered],
  )

  const newRemaining = useMemo(() => {
    if (!rowsFiltered || !linesFiltered) return 0
    const activeIds = new Set(
      (linesFiltered ?? []).filter(l => l.is_active).map(l => l.id),
    )
    const myIds = new Set((rowsFiltered ?? []).map(r => r.line_id))
    let remain = 0
    for (const id of activeIds) if (!myIds.has(id)) remain++
    return remain
  }, [rowsFiltered, linesFiltered])

  const totalCompleted = useMemo(
    () => Math.max(0, linesTotal - newRemaining),
    [linesTotal, newRemaining],
  )

  const completionPct = useMemo(() => {
    if (linesTotal === 0) return 0
    return (totalCompleted / linesTotal) * 100
  }, [totalCompleted, linesTotal])

  const longestDayStreak = useMemo(
    () => computeLongestPassStreak(eventsFiltered ?? []),
    [eventsFiltered],
  )

  // Openings mastered (same logic as Stats page)
  const openingsMastered = useMemo(() => {
    if (!rowsFiltered || !linesFiltered || !eventsFiltered) return 0
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
    const activeIds = new Set(
      (linesFiltered ?? []).filter(l => l.is_active).map(l => l.id),
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

  const masteryPct = useMemo(() => {
    if (linesTotal === 0) return 0
    return (openingsMastered / linesTotal) * 100
  }, [openingsMastered, linesTotal])


  // ----- Achievements -----
const streakAchievements: Achievement[] = useMemo(() => {
  const thresholds = [
    { id: 'streak_2d', label: '2 day streak', days: 2,  medalColor: 'bg-red-500',    medalLabel: 'Red Medal' },
    { id: 'streak_5d', label: '5 day streak', days: 5,  medalColor: 'bg-orange-500', medalLabel: 'Orange Medal' },
    { id: 'streak_2w', label: '2 week streak', days: 14, medalColor: 'bg-yellow-400', medalLabel: 'Yellow Medal' },
    { id: 'streak_1m', label: '1 month streak', days: 30, medalColor: 'bg-white',    medalLabel: 'White Medal' },
    { id: 'streak_3m', label: '3 month streak', days: 90, medalColor: 'bg-green-500', medalLabel: 'Green Medal' },
    { id: 'streak_6m', label: '6 month streak', days: 180, medalColor: 'bg-blue-500', medalLabel: 'Blue Medal' },
    { id: 'streak_1y', label: '1 year streak', days: 365, medalColor: 'bg-black',    medalLabel: 'Black Medal' },
  ]
  return thresholds.map(t => ({
    id: t.id,
    label: t.label,
    unlocked: longestDayStreak >= t.days,
    detail: `Longest streak: ${longestDayStreak} day(s)`,
    medalColor: t.medalColor,
    medalLabel: t.medalLabel,
  }))
}, [longestDayStreak])


const completionAchievements: Achievement[] = useMemo(() => {
  const countThresholds = [
    { id: 'comp_10',  label: '10 openings completed',  target: 10,  medalColor: 'bg-red-500',    medalLabel: 'Red Medal' },
    { id: 'comp_50',  label: '50 openings completed',  target: 50,  medalColor: 'bg-orange-500', medalLabel: 'Orange Medal' },
    { id: 'comp_100', label: '100 openings completed', target: 100, medalColor: 'bg-yellow-400', medalLabel: 'Yellow Medal' },
  ]
  const pctThresholds = [
    { id: 'comp_25pct', label: '25% of openings completed', pct: 25,  medalColor: 'bg-white',     medalLabel: 'White Medal' },
    { id: 'comp_50pct', label: '50% of openings completed', pct: 50,  medalColor: 'bg-green-500', medalLabel: 'Green Medal' },
    { id: 'comp_75pct', label: '75% of openings completed', pct: 75,  medalColor: 'bg-blue-500',  medalLabel: 'Blue Medal' },
    { id: 'comp_100pct', label: '100% of openings completed', pct: 100, medalColor: 'bg-black',  medalLabel: 'Black Medal' },
  ]

  const counts: Achievement[] = countThresholds.map(t => ({
    id: t.id,
    label: t.label,
    unlocked: totalCompleted >= t.target,
    detail: `Completed: ${totalCompleted} openings`,
    medalColor: t.medalColor,
    medalLabel: t.medalLabel,
  }))

  const pcts: Achievement[] = pctThresholds.map(t => ({
    id: t.id,
    label: t.label,
    unlocked: completionPct >= t.pct,
    detail: `Completion: ${completionPct.toFixed(1)}% (${totalCompleted}/${linesTotal})`,
    medalColor: t.medalColor,
    medalLabel: t.medalLabel,
  }))

  return [...counts, ...pcts]
}, [totalCompleted, completionPct, linesTotal])



const masteryAchievements: Achievement[] = useMemo(() => {
  const countThresholds = [
    { id: 'mast_1',   label: '1 opening mastered',   target: 1,   medalColor: 'bg-red-500',    medalLabel: 'Red Medal' },
    { id: 'mast_10',  label: '10 openings mastered', target: 10,  medalColor: 'bg-orange-500', medalLabel: 'Orange Medal' },
    { id: 'mast_100', label: '100 openings mastered', target: 100, medalColor: 'bg-white',    medalLabel: 'White Medal' },
  ]
  const pctThresholds = [
    { id: 'mast_50pct', label: '50% openings mastered', pct: 50,  medalColor: 'bg-green-500', medalLabel: 'Green Medal' },
    { id: 'mast_75pct', label: '75% openings mastered', pct: 75,  medalColor: 'bg-blue-500',  medalLabel: 'Blue Medal' },
    { id: 'mast_100pct', label: '100% openings mastered', pct: 100, medalColor: 'bg-black',  medalLabel: 'Black Medal' },
  ]

  const counts: Achievement[] = countThresholds.map(t => ({
    id: t.id,
    label: t.label,
    unlocked: openingsMastered >= t.target,
    detail: `Mastered: ${openingsMastered} openings`,
    medalColor: t.medalColor,
    medalLabel: t.medalLabel,
  }))

  const pcts: Achievement[] = pctThresholds.map(t => ({
    id: t.id,
    label: t.label,
    unlocked: masteryPct >= t.pct,
    detail: `Mastery: ${masteryPct.toFixed(1)}% (${openingsMastered}/${linesTotal})`,
    medalColor: t.medalColor,
    medalLabel: t.medalLabel,
  }))

  return [...counts, ...pcts]
}, [openingsMastered, masteryPct, linesTotal])


  return (
    <Protected>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Achievements
            </h1>
<p className="text-sm text-gray-500">
  Achievements are tracked separately for each deck you study.
</p>
{selectedDeckId && (
  <div className="text-sm text-gray-500 mt-1">
    Deck:{' '}
    <span className="font-medium">
      {decks.find(d => d.id === selectedDeckId)?.name ?? 'Unknown'}
    </span>
  </div>
)}

          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              View achievements for
            </span>
<select
  className="text-sm px-2 py-1 border rounded-lg bg-white"
value={selectedDeckId ?? (decks[0]?.id ?? '')}
onChange={e => setSelectedDeckId(e.target.value)}

  disabled={loading || decks.length === 0}
>
  {decks.map(d => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ))}
</select>

          </div>
        </header>

        {loading && (
          <div className="text-sm text-gray-500">Loading achievements…</div>
        )}

        {!loading && (
          <div className="space-y-8">
            <AchievementsSection
              title="Streaks"
              achievements={streakAchievements}
            />
            <AchievementsSection
              title="Openings Completed"
              achievements={completionAchievements}
            />
            <AchievementsSection
              title="Openings Mastered"
              achievements={masteryAchievements}
            />
          </div>
        )}
      </div>
    </Protected>
  )
}

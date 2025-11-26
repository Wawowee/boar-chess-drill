'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import Protected from '@/app/protected'

type LineRow = {
    id: string
    line_name: string | null
    created_at: string
    openings: {
        name: string | null
        side: 'white' | 'black' | null
        // not strictly required for UI, but handy to have
        deck_id?: string | null
    } | null
}

type Deck = {
    id: string
    name: string
}


export default function ManageOpeningsPage() {
    const [rows, setRows] = useState<LineRow[]>([])
    const [loading, setLoading] = useState(true)
    const [q, setQ] = useState('')
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [page, setPage] = useState(0)
    const pageSize = 50
    const [deleting, setDeleting] = useState(false)
    const [useCascade, setUseCascade] = useState(true) // toggle if you didn't add CASCADE

    const [decks, setDecks] = useState<Deck[]>([])
    const [selectedDeckId, setSelectedDeckId] = useState<'all' | string>('all')
    const [initialDeckId, setInitialDeckId] = useState<string | null>(null)
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) {
                    if (!cancelled) setIsAdmin(false)
                    return
                }

                const { data: isAdminFlag, error } = await supabase.rpc('is_admin')
                if (!cancelled) {
                    if (error) {
                        console.error('is_admin RPC error', error)
                        setIsAdmin(false)
                    } else {
                        setIsAdmin(!!isAdminFlag)
                    }
                }
            })()
        return () => { cancelled = true }
    }, [])


    useEffect(() => {
        let cancelled = false
            ; (async () => {
                if (isAdmin !== true) return
                const { data: auth } = await supabase.auth.getUser()
                const myUid = auth.user?.id
                if (!myUid) return

                const [{ data: deckRows, error: deckErr }, { data: settings, error: settingsErr }] =
                    await Promise.all([
                        supabase
                            .from('decks')
                            .select('id,name')
                            .order('created_at', { ascending: true }),
                        supabase
                            .from('user_settings')
                            .select('current_deck_id')
                            .eq('user_id', myUid)
                            .maybeSingle(),
                    ])

                if (cancelled) return

                if (!deckErr && deckRows) setDecks(deckRows as Deck[])

                const currentDeckId = settingsErr ? null : (settings?.current_deck_id ?? null)
                setInitialDeckId(currentDeckId)
                setSelectedDeckId(currentDeckId || 'all')
            })()

        return () => {
            cancelled = true
        }
    }, [isAdmin])


    async function load() {
        setLoading(true)
        let query = supabase
            .from('lines')
            .select('id,line_name,created_at,openings(name,side,deck_id)')
            .order('created_at', { ascending: false })

        // Filter by deck if not "all"
        if (selectedDeckId !== 'all') {
            query = query.eq('openings.deck_id', selectedDeckId)
        }

        // Basic search by line_name; can extend to openings.name if desired
        if (q.trim()) {
            query = query.ilike('line_name', `%${q.trim()}%`)
            // You can also add openings.name search via .or(...) if needed
        }

        // Pagination
        query = query.range(page * pageSize, page * pageSize + pageSize - 1)

        const { data, error } = await query
        if (!error) setRows((data ?? []) as LineRow[])
        setLoading(false)
    }


    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, selectedDeckId])


    const allChecked = useMemo(
        () => rows.length > 0 && rows.every(r => selected[r.id]),
        [rows, selected]
    )

    function toggleAll() {
        const next = { ...selected }
        if (allChecked) {
            rows.forEach(r => { delete next[r.id] })
        } else {
            rows.forEach(r => { next[r.id] = true })
        }
        setSelected(next)
    }

    function toggleOne(id: string) {
        setSelected(prev => ({ ...prev, [id]: !prev[id] }))
    }

    async function deleteIds(ids: string[]) {
        if (!ids.length) return
        const sure = confirm(
            `Delete ${ids.length} line(s) for ALL users?\nThis cannot be undone.`
        )
        if (!sure) return
        setDeleting(true)
        try {
            // First, figure out which openings these lines belong to
            const { data: lineRefs, error: refErr } = await supabase
                .from('lines')
                .select('id, opening_id')
                .in('id', ids)

            if (refErr) throw refErr

            const openingIds = Array.from(
                new Set(
                    (lineRefs ?? [])
                        .map((r: { opening_id: string | null }) => r.opening_id)
                        .filter((id: string | null): id is string => !!id)
                )
            )


            if (useCascade) {
                // "DB cascade" mode – still just delete lines and let DB FKs handle the rest
                const { error } = await supabase
                    .from('lines')
                    .delete()
                    .in('id', ids)
                if (error) throw error
            } else {
                // Manual cleanup mode

                // 1) Delete resources tied to these lines
                const { error: resErr } = await supabase
                    .from('opening_resources')
                    .delete()
                    .in('line_id', ids)
                if (resErr) throw resErr

                // 2) Delete reviews tied to these lines
                const { error: revErr } = await supabase
                    .from('reviews')
                    .delete()
                    .in('line_id', ids)
                if (revErr) throw revErr

                // 3) Delete review_events tied to these lines (for stats history)
                const { error: evErr } = await supabase
                    .from('review_events')
                    .delete()
                    .in('line_id', ids)
                if (evErr) throw evErr

                // 4) Finally delete the lines themselves
                const { error: lineErr } = await supabase
                    .from('lines')
                    .delete()
                    .in('id', ids)
                if (lineErr) throw lineErr

                // 5) Clean up orphan openings (openings that no longer have any lines)
                if (openingIds.length) {
                    const { data: remaining, error: remErr } = await supabase
                        .from('lines')
                        .select('opening_id')
                        .in('opening_id', openingIds)

                    if (remErr) throw remErr

                    const stillUsed = new Set(
                        (remaining ?? []).map(
                            (r: { opening_id: string | null }) => r.opening_id
                        )
                    )

                    const orphanOpeningIds = openingIds.filter(
                        (id) => !stillUsed.has(id)
                    )

                    if (orphanOpeningIds.length) {
                        // Delete any resources that might be attached directly to these openings
                        const { error: resOpenErr } = await supabase
                            .from('opening_resources')
                            .delete()
                            .in('opening_id', orphanOpeningIds)
                        if (resOpenErr) throw resOpenErr

                        // Delete the orphan openings themselves
                        const { error: opErr } = await supabase
                            .from('openings')
                            .delete()
                            .in('id', orphanOpeningIds)
                        if (opErr) throw opErr
                    }
                }
            }

            // Optimistic UI: remove from current page
            setRows(prev => prev.filter(r => !ids.includes(r.id)))
            setSelected(prev => {
                const copy = { ...prev }
                ids.forEach(id => delete copy[id])
                return copy
            })
        } finally {
            setDeleting(false)
        }
    }


    if (isAdmin === null) {
        return (
            <Protected>
                <div className="p-4 text-sm text-gray-500">Checking permissions…</div>
            </Protected>
        )
    }

    if (isAdmin === false) {
        return (
            <Protected>
                <div className="p-4 text-sm text-red-600">
                    You must be an admin to access this page.
                </div>
            </Protected>
        )
    }

    return (
        <Protected>
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold">Manage Openings</h1>
                    <div className="flex items-center gap-2">
                        <Link href="/admin" className="text-sm px-3 py-2 rounded-lg border hover:bg-gray-50">Admin Home</Link>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by line name…"
                        className="px-3 py-2 border rounded-lg w-64"
                    />
                    <button
                        onClick={() => { setPage(0); load() }}
                        className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        Search
                    </button>

                    {/* New: deck selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Set:</span>
                        <select
                            className="px-2 py-1 border rounded-lg text-sm"
                            value={selectedDeckId}
                            onChange={(e) => {
                                const v = e.target.value as 'all' | string
                                setPage(0)
                                setSelectedDeckId(v)
                            }}
                        >
                            <option value="all">All sets</option>
                            {decks.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Link
                        href="/admin/manage-sets"
                        className="text-sm px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        Manage sets
                    </Link>

                    <div className="ml-auto flex items-center gap-3">
                        <label className="text-xs flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={useCascade}
                                onChange={(e) => setUseCascade(e.target.checked)}
                            />
                            Use ON DELETE CASCADE
                        </label>
                        <button
                            disabled={deleting || !Object.keys(selected).some(k => selected[k])}
                            onClick={() => deleteIds(Object.keys(selected).filter(k => selected[k]))}
                            className="px-3 py-2 rounded-lg border text-red-700 border-red-300 hover:bg-red-50 disabled:opacity-50"
                        >
                            Delete Selected
                        </button>
                    </div>
                </div>


                <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-2 w-10 text-center">
                                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                                </th>
                                <th className="p-2 text-left">Line</th>
                                <th className="p-2 text-left">Opening</th>
                                <th className="p-2 text-left">Side</th>
                                <th className="p-2 text-left">Added</th>
                                <th className="p-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={6} className="p-4">Loading…</td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={6} className="p-4 text-gray-500">No openings found.</td></tr>
                            )}
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t">
                                    <td className="p-2 text-center">
                                        <input
                                            type="checkbox"
                                            checked={!!selected[r.id]}
                                            onChange={() => toggleOne(r.id)}
                                        />
                                    </td>
                                    <td className="p-2">{r.line_name ?? <span className="text-gray-400">Untitled</span>}</td>
                                    <td className="p-2">{r.openings?.name ?? '–'}</td>
                                    <td className="p-2 capitalize">{r.openings?.side ?? '–'}</td>
                                    <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                                    <td className="p-2 text-right flex gap-2 justify-end">
                                        <a
                                            href={`/admin/lines/${r.id}`}
                                            className="px-2 py-1 rounded border hover:bg-gray-50"
                                        >
                                            Edit
                                        </a>
                                        <button
                                            disabled={deleting}
                                            onClick={() => deleteIds([r.id])}
                                            className="px-2 py-1 rounded border text-red-700 border-red-300 hover:bg-red-50 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </td>

                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                        disabled={page === 0}
                    >
                        ← Prev
                    </button>
                    <div className="text-sm text-gray-500">Page {page + 1}</div>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        Next →
                    </button>
                </div>
            </div>
        </Protected>
    )
}

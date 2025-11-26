'use client'

import Protected from '@/app/protected'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

type Deck = {
    id: string
    name: string
    description: string | null
    created_at: string
    is_hidden: boolean
}


export default function ManageSetsPage() {
    const [decks, setDecks] = useState<Deck[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
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
        return () => {
            cancelled = true
        }
    }, [])


    async function load() {
        setLoading(true)
        const { data, error } = await supabase
            .from('decks')
            .select('id,name,description,created_at,is_hidden')
            .order('created_at', { ascending: true })


        if (!error && data) {
            setDecks(data as Deck[])
        }
        setLoading(false)
    }

    useEffect(() => {
        if (isAdmin !== true) return
        load()
    }, [isAdmin])

    async function onDeleteDeck(deck: Deck) {
        const ok = confirm(
            `Delete set "${deck.name}" and ALL of its openings, lines, and stats for ALL users?\n\nThis cannot be undone.`
        )
        if (!ok) return

        setBusyId(deck.id)
        setMessage(null)

        // 1) Get all openings in this deck
        const { data: openingRows, error: openErr } = await supabase
            .from('openings')
            .select('id')
            .eq('deck_id', deck.id)

        if (openErr) {
            setMessage('Error loading openings for this set: ' + openErr.message)
            setBusyId(null)
            return
        }

        const openingIds: string[] = (openingRows ?? []).map(
            (o: { id: string }) => o.id,
        )

        // 2) Get all lines that belong to those openings
        let lineIds: string[] = []
        if (openingIds.length) {
            const { data: lineRows, error: lineErr } = await supabase
                .from('lines')
                .select('id')
                .in('opening_id', openingIds)

            if (lineErr) {
                setMessage('Error loading lines for this set: ' + lineErr.message)
                setBusyId(null)
                return
            }

            lineIds = (lineRows ?? []).map((l: { id: string }) => l.id)
        }

        // 3) Delete resources / reviews / events tied to these lines
        if (lineIds.length) {
            const { error: resErr } = await supabase
                .from('opening_resources')
                .delete()
                .in('line_id', lineIds)
            if (resErr) {
                setMessage('Error deleting line resources: ' + resErr.message)
                setBusyId(null)
                return
            }

            const { error: revErr } = await supabase
                .from('reviews')
                .delete()
                .in('line_id', lineIds)
            if (revErr) {
                setMessage('Error deleting reviews: ' + revErr.message)
                setBusyId(null)
                return
            }

            const { error: evErr } = await supabase
                .from('review_events')
                .delete()
                .in('line_id', lineIds)
            if (evErr) {
                setMessage('Error deleting review events: ' + evErr.message)
                setBusyId(null)
                return
            }

            const { error: lineDelErr } = await supabase
                .from('lines')
                .delete()
                .in('id', lineIds)
            if (lineDelErr) {
                setMessage('Error deleting lines: ' + lineDelErr.message)
                setBusyId(null)
                return
            }
        }

        // 4) Delete any resources attached directly to these openings,
        //    then delete the openings themselves
        if (openingIds.length) {
            const { error: resOpenErr } = await supabase
                .from('opening_resources')
                .delete()
                .in('opening_id', openingIds)
            if (resOpenErr) {
                setMessage('Error deleting opening resources: ' + resOpenErr.message)
                setBusyId(null)
                return
            }

            const { error: openDelErr } = await supabase
                .from('openings')
                .delete()
                .in('id', openingIds)
            if (openDelErr) {
                setMessage('Error deleting openings: ' + openDelErr.message)
                setBusyId(null)
                return
            }
        }

        // 5) Clear any user_settings.current_deck_id pointing at this deck
        const { error: settingsErr } = await supabase
            .from('user_settings')
            .update({ current_deck_id: null })
            .eq('current_deck_id', deck.id)

        if (settingsErr) {
            setMessage('Error clearing user settings: ' + settingsErr.message)
            setBusyId(null)
            return
        }

        // 6) Delete the deck
        const { error: delErr } = await supabase
            .from('decks')
            .delete()
            .eq('id', deck.id)

        if (delErr) {
            setMessage('Error deleting set: ' + delErr.message)
            setBusyId(null)
            return
        }

        setMessage(`Deleted set "${deck.name}" and all of its openings.`)
        setBusyId(null)
        await load()
    }

    async function toggleHidden(deck: Deck) {
        const nextHidden = !deck.is_hidden
        setBusyId(deck.id)
        setMessage(null)

        const { error } = await supabase
            .from('decks')
            .update({ is_hidden: nextHidden })
            .eq('id', deck.id)

        if (error) {
            setMessage('Error updating visibility: ' + error.message)
            setBusyId(null)
            return
        }

        setDecks(prev =>
            prev.map(d =>
                d.id === deck.id ? { ...d, is_hidden: nextHidden } : d,
            ),
        )
        setBusyId(null)
    }



    if (isAdmin === null) {
        return (
            <Protected>
                <div className="p-4 text-sm text-gray-500">
                    Checking permissions…
                </div>
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
            <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Manage sets</h1>
                        <p className="text-sm text-gray-500">
                            View and delete opening sets. Deleting a set will remove all its openings and lines for all users.
                        </p>

                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/library"
                            className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
                        >
                            Back to Library
                        </Link>
                        <Link
                            href="/admin/manage-openings"
                            className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
                        >
                            Manage openings
                        </Link>
                    </div>
                </div>

                {message && (
                    <div className="text-sm px-3 py-2 rounded bg-amber-50 text-amber-900 border border-amber-200">
                        {message}
                    </div>
                )}

                {loading ? (
                    <div className="text-sm text-gray-500">Loading…</div>
                ) : decks.length === 0 ? (
                    <div className="text-sm text-gray-500">No sets yet.</div>
                ) : (
                    <ul className="divide-y border rounded-lg bg-white dark:bg-slate-900">
                                {decks.map(deck => (
                                    <li
                                        key={deck.id}
                                        className="flex items-center justify-between gap-3 px-4 py-3"
                                    >
                                        <div>
                                            <div className="font-medium">{deck.name}</div>
                                            {deck.description && (
                                                <div className="text-xs text-gray-500">
                                                    {deck.description}
                                                </div>
                                            )}
                                            <div className="text-[11px] text-gray-400 mt-1">
                                                Created{' '}
                                                {new Date(deck.created_at).toLocaleDateString()}
                                            </div>
                                            {deck.is_hidden && (
                                                <div className="text-[11px] text-amber-600 mt-1">
                                                    Hidden from Library
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={busyId === deck.id}
                                                onClick={() => toggleHidden(deck)}
                                                className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {deck.is_hidden ? 'Show in Library' : 'Hide from Library'}
                                            </button>
                                            <button
                                                disabled={busyId === deck.id}
                                                onClick={() => onDeleteDeck(deck)}
                                                className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                            >
                                                {busyId === deck.id ? 'Deleting…' : 'Delete'}
                                            </button>
                                        </div>
                                    </li>
                                ))}

                    </ul>
                )}
            </div>
        </Protected>
    )
}

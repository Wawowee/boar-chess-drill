'use client'
import Protected from '@/app/protected'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Chess } from 'chess.js'
import Link from 'next/link'

type DraftResource = {
    kind: 'youtube' | 'image' | 'link' | 'text'
    title?: string
    url?: string
    content?: string
    sort_order?: number
}

export default function AdminPage() {
    const [openingName, setOpeningName] = useState('Ruy Lopez')
    const [side, setSide] = useState<'white' | 'black' | 'both'>('white')
    const [moves, setMoves] = useState('e4 e5 Nf3 Nc6 Bb5')
    const [lineName, setLineName] = useState('New Line')
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [decks, setDecks] = useState<{ id: string; name: string }[]>([])
    const [deckId, setDeckId] = useState<string>('')        // selected deck id or '__new__'
    const [newDeckName, setNewDeckName] = useState('')      // for creating a new deck
    const [pgnImport, setPgnImport] = useState('')
    const [importing, setImporting] = useState(false)
    const [importMsg, setImportMsg] = useState<string | null>(null)

    const [resources, setResources] = useState<DraftResource[]>([])
    const addResource = () => setResources(r => [...r, { kind: 'text', title: '', content: '', sort_order: r.length }])
    const updateResource = (i: number, patch: Partial<DraftResource>) =>
        setResources(r => r.map((it, idx) => idx === i ? { ...it, ...patch } : it))
    const removeResource = (i: number) =>
        setResources(r => r.filter((_, idx) => idx !== i))
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false;
        (async () => {
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
        if (isAdmin !== true) return
        (async () => {
            const { data, error } = await supabase
                .from('decks')
                .select('id, name')
                .order('created_at', { ascending: true })

            if (!error && data) {
                setDecks(data)
                // Default to first deck if nothing chosen yet
                if (data.length && !deckId) {
                    setDeckId(data[0].id)
                }
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin])

    function parseToSAN(input: string): string[] {
        const trimmed = input.trim();
        if (!trimmed) return [];

        // --- Try as PGN first (no return value from loadPgn in this chess.js) ---
        const g = new Chess();
        try {
            g.loadPgn(trimmed);               // no 'sloppy' and no boolean return in your version
            const hist = g.history();         // if it parsed, there will be SAN moves here
            if (hist.length > 0) return hist;
        } catch {
            // fall through to manual cleanup / token parse
        }

        // --- Fallback: strip PGN artifacts, then feed tokens one by one ---
        // remove comments {...}, variations (...), NAGs $#, move numbers '12.' or '12...'
        let s = trimmed
            .replace(/\{[^}]*\}/g, ' ')       // comments
            .replace(/\([^)]*\)/g, ' ')       // variations
            .replace(/\$\d+/g, ' ')           // NAGs
            .replace(/\d+\.(\.\.)?/g, ' ')    // move numbers
            .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ') // results
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = s ? s.split(' ') : [];
        if (tokens.length === 0) return [];

        const h = new Chess();
        const out: string[] = [];

        for (const t of tokens) {
            try {
                const before = h.history().length;
                // No 'sloppy' option available in your chess.js typings; rely on standard SAN parsing
                const mv = h.move(t as any);
                if (mv && h.history().length > before) {
                    out.push(h.history()[h.history().length - 1]); // confirmed SAN
                }
            } catch {
                // ignore tokens that aren’t legal from the current position
            }
        }
        return out;
    }

    type ParsedPgnOpening = {
        openingName: string
        variationName: string
        side: 'white' | 'black' | 'both'
        movesText: string
        lichessResource?: string
    }

    function parseTaggedPgn(raw: string): ParsedPgnOpening[] {
        const lines = raw.split(/\r?\n/)
        const result: ParsedPgnOpening[] = []
        let current: ParsedPgnOpening | null = null

        const flushCurrent = () => {
            if (current && current.openingName && current.movesText.trim()) {
                result.push({
                    openingName: current.openingName,
                    variationName: current.variationName || 'Imported line',
                    side: current.side,
                    movesText: current.movesText.trim(),
                    lichessResource: current.lichessResource?.trim() || undefined,
                })
            }
            current = null
        }

        for (let line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            // Tag line like [Opening "Sicilian Defense"]
            if (trimmed.startsWith('[')) {
                const m = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]/)
                if (!m) continue
                const tag = m[1]
                const value = m[2]

                if (tag === 'Opening') {
                    // new block
                    flushCurrent()
                    current = {
                        openingName: value,
                        variationName: '',
                        side: 'white',
                        movesText: '',
                        lichessResource: '',
                    }
                } else if (tag === 'Variation') {
                    if (!current) {
                        current = {
                            openingName: value,
                            variationName: '',
                            side: 'white',
                            movesText: '',
                            lichessResource: '',
                        }
                    }
                    current.variationName = value
                } else if (tag === 'Side') {
                    if (!current) {
                        current = {
                            openingName: '',
                            variationName: '',
                            side: 'white',
                            movesText: '',
                            lichessResource: '',
                        }
                    }
                    const v = value.toLowerCase()
                    if (v === 'white' || v === 'black' || v === 'both') {
                        current.side = v
                    }
                } else if (tag === 'LichessResource') {
                    if (!current) {
                        current = {
                            openingName: '',
                            variationName: '',
                            side: 'white',
                            movesText: '',
                            lichessResource: '',
                        }
                    }
                    current.lichessResource = value
                }

                continue
            }

            // Move text line (e.g. "1. e4 c5 2. Nc3 ... *")
            if (!current) {
                // if moves appear without preceding tags, skip them
                continue
            }
            if (current.movesText) current.movesText += ' '
            current.movesText += trimmed
        }

        flushCurrent()
        return result
    }



    const onSave = async () => {
        setSaving(true); setMsg(null)

        // 1) Resolve which deck we're saving into
        let effectiveDeckId = deckId

        if (!effectiveDeckId || effectiveDeckId === '__new__') {
            const name = newDeckName.trim()
            if (!name) {
                setMsg('Please enter a name for the new set.')
                setSaving(false)
                return
            }

            const { data: newDeck, error: deckErr } = await supabase
                .from('decks')
                .insert({ name })
                .select('id, name')
                .single()

            if (deckErr || !newDeck) {
                setMsg('Could not create set: ' + (deckErr?.message ?? 'unknown'))
                setSaving(false)
                return
            }

            effectiveDeckId = newDeck.id
            setDecks(prev => [...prev, { id: newDeck.id, name: newDeck.name }])
            setDeckId(newDeck.id)
            setNewDeckName('')
        }

        // 2) Find or create the opening *within this deck*
        const { data: open } =
            await supabase
                .from('openings')
                .select('id')
                .eq('name', openingName)
                .eq('deck_id', effectiveDeckId)
                .eq('side', side)
                .limit(1)
                .maybeSingle()

        let openingId = open?.id

        if (!openingId) {
            const { data: ins, error } = await supabase
                .from('openings')
                .insert({ name: openingName, side, deck_id: effectiveDeckId })
                .select('id')
                .single()

            if (error || !ins) {
                setMsg('Error creating opening: ' + (error?.message ?? 'unknown'))
                setSaving(false)
                return
            }
            openingId = ins.id
        }

        // 3) Parse moves and create line
        const movesArray = parseToSAN(moves);
        if (!movesArray.length) {
            setMsg('Could not parse moves. Please provide SAN or a valid PGN.');
            setSaving(false);
            return;
        }

        const { data: lineIns, error: lineErr } = await supabase
            .from('lines')
            .insert({ opening_id: openingId, line_name: lineName, moves_san: movesArray })
            .select('id')
            .single()

        if (lineErr || !lineIns?.id) {
            setMsg('Error adding line: ' + (lineErr?.message ?? 'unknown'))
            setSaving(false)
            return
        }

        // 4) Resources (unchanged)
        if (resources.length) {
            const payload = resources.map((r, idx) => ({
                opening_id: openingId,
                line_id: lineIns.id,
                kind: r.kind,
                title: r.title ?? null,
                url: r.url ?? null,
                content: r.content ?? null,
                sort_order: r.sort_order ?? idx,
                is_active: true,
            }))
            const { error: resErr } = await supabase.from('opening_resources').insert(payload)
            if (resErr) {
                setMsg('Saved line, but resources failed: ' + resErr.message)
                setSaving(false)
                return
            }
        }

        setMsg('Saved! You can drill it now.')
        setSaving(false)
    }

    const onImportPgn = async () => {
        setImporting(true)
        setImportMsg(null)

        // 1) Resolve which deck we're importing into (same logic as onSave)
        let effectiveDeckId = deckId

        if (!effectiveDeckId || effectiveDeckId === '__new__') {
            const name = newDeckName.trim()
            if (!name) {
                setImportMsg('Please enter a name for the new set before importing.')
                setImporting(false)
                return
            }

            const { data: newDeck, error: deckErr } = await supabase
                .from('decks')
                .insert({ name })
                .select('id, name')
                .single()

            if (deckErr || !newDeck) {
                setImportMsg('Could not create set: ' + (deckErr?.message ?? 'unknown'))
                setImporting(false)
                return
            }

            effectiveDeckId = newDeck.id
            setDecks(prev => [...prev, { id: newDeck.id, name: newDeck.name }])
            setDeckId(newDeck.id)
            setNewDeckName('')
        }

        const entries = parseTaggedPgn(pgnImport)
        if (!entries.length) {
            setImportMsg('No valid [Opening]/[Variation]/[Side] blocks found in PGN.')
            setImporting(false)
            return
        }

        let createdLines = 0
        let skipped = 0

        for (const entry of entries) {
            const movesArray = parseToSAN(entry.movesText)
            if (!movesArray.length) {
                skipped++
                continue
            }

            // find or create opening per deck + name + side (same as onSave)
            const { data: open } = await supabase
                .from('openings')
                .select('id')
                .eq('name', entry.openingName)
                .eq('deck_id', effectiveDeckId)
                .eq('side', entry.side)
                .limit(1)
                .maybeSingle()

            let openingId = open?.id
            if (!openingId) {
                const { data: ins, error } = await supabase
                    .from('openings')
                    .insert({
                        name: entry.openingName,
                        side: entry.side,
                        deck_id: effectiveDeckId,
                    })
                    .select('id')
                    .single()

                if (error || !ins) {
                    console.error('Error creating opening during import', error)
                    skipped++
                    continue
                }
                openingId = ins.id
            }
            const { data: lineIns, error: lineErr } = await supabase
                .from('lines')
                .insert({
                    opening_id: openingId,
                    line_name: entry.variationName || 'Imported line',
                    moves_san: movesArray,
                })
                .select('id')
                .single()

            if (lineErr || !lineIns?.id) {
                console.error('Error adding line during import', lineErr)
                skipped++
                continue
            }

            // If PGN provided a LichessResource tag, create a link resource for this line
            const lichessUrl = entry.lichessResource?.trim()
            if (lichessUrl) {
                const { error: resErr } = await supabase
                    .from('opening_resources')
                    .insert({
                        opening_id: openingId,
                        line_id: lineIns.id,
                        kind: 'link',
                        title: 'Lichess analysis',
                        url: lichessUrl,
                        content: null,
                        sort_order: 0,
                        is_active: true,
                    })

                if (resErr) {
                    // Don’t fail the whole line import—just log it.
                    console.error('Error adding Lichess resource during import', resErr)
                }
            }

            createdLines++

        }

        setImportMsg(
            `Imported ${createdLines} line(s) into this set.` +
            (skipped ? ` (${skipped} skipped due to parse errors.)` : ''),
        )
        setImporting(false)
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
            <div className="space-y-6 max-w-2xl">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="text-2xl font-semibold">Admin — Add / Edit Openings</h1>
                    <Link
                        href="/library"
                        className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
                    >
                        Library
                    </Link>
                </div>

                <label className="block">
                    <div className="text-sm text-gray-600">Opening name</div>
                    <input value={openingName} onChange={e => setOpeningName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </label>
                <label className="block">
                    <div className="text-sm text-gray-600">Opening set (deck)</div>
                    <select
                        value={deckId}
                        onChange={e => setDeckId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                    >
                        {decks.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                        <option value="__new__">+ Create new set…</option>
                    </select>
                </label>

                {deckId === '__new__' && (
                    <label className="block">
                        <div className="text-sm text-gray-600">New set name</div>
                        <input
                            value={newDeckName}
                            onChange={e => setNewDeckName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </label>
                )}

                <label className="block">
                    <div className="text-sm text-gray-600">Line name</div>
                    <input value={lineName} onChange={e => setLineName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </label>

                <label className="block">
                    <div className="text-sm text-gray-600">Side</div>
                    <select value={side} onChange={e => setSide(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
                        <option value="white">white</option>
                        <option value="black">black</option>
                        <option value="both">both</option>
                    </select>
                </label>

                <label className="block">
                    <div className="text-sm text-gray-600">Moves (SAN or PGN)</div>
                    <textarea value={moves} onChange={e => setMoves(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg" />
                </label>

                {/* NEW: Resources editor */}
                <div className="rounded-lg border p-3">
                    ...
                </div>

                {/* NEW: Mass import from PGN */}
                <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="font-medium">Mass import from PGN</div>
                        <button
                            onClick={onImportPgn}
                            disabled={importing}
                            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-60"
                        >
                            {importing ? 'Importing…' : 'Import PGN into this set'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        Paste PGN blocks with [Opening], [Variation], and [Side] tags.
                        Each block will become a line in the selected set.
                    </p>
                    <textarea
                        value={pgnImport}
                        onChange={e => setPgnImport(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-2 border rounded-lg font-mono text-xs"
                        placeholder={`[Opening "Sicilian Defense"]
[Variation "Closed"]
[Side "white"]

1. e4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 *

[Opening "Sicilian Defense"]
[Variation "Najdorf Variation"]
[Side "white"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 h6 8. Bh4 Qb6 *`}
                    />
                    {importMsg && (
                        <div className="text-sm text-gray-700">
                            {importMsg}
                        </div>
                    )}
                </div>

                <button
                    onClick={onSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg border shadow-sm hover:bg-gray-50"
                >
                    {saving ? 'Saving…' : 'Save line & resources'}
                </button>
                {msg && <div className="text-sm">{msg}</div>}

            </div>
        </Protected>
    )
}


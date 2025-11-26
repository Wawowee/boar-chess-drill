'use client'

import Protected from '@/app/protected'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback: RFC4122 v4 using crypto.getRandomValues
  const bytes = (crypto as Crypto).getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


type DraftResource = {
  id?: string
  kind: 'youtube' | 'image' | 'link' | 'text'
  title?: string | null
  url?: string | null
  content?: string | null
  sort_order?: number
  is_active?: boolean
}

type SupaResourceRow = {
  id: string
  kind: 'youtube' | 'image' | 'link' | 'text'
  title: string | null
  url: string | null
  content: string | null
  sort_order: number | null
  is_active: boolean | null
};


export default function EditLinePage() {
  const params = useParams() as { id: string }
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Opening + line fields (we only UPDATE; never delete line to preserve SRS)
  const [openingName, setOpeningName] = useState('')
  const [side, setSide] = useState<'white' | 'black' | 'both'>('white')
  const [lineName, setLineName] = useState<string>('')
  const [moves, setMoves] = useState<string>('')

  // Resources (CRUD via upsert/delete)
  const [resources, setResources] = useState<DraftResource[]>([])
    const [deletedIds, setDeletedIds] = useState<string[]>([])
    const [openingId, setOpeningId] = useState<string | null>(null)
    const [openingDeckId, setOpeningDeckId] = useState<string | null>(null)


function addResource() {
  setResources((r: DraftResource[]) => [
    ...r,
    { kind: 'text', title: '', content: '', sort_order: r.length, is_active: true },
  ]);
}

function updateResource(i: number, patch: Partial<DraftResource>) {
  setResources((r: DraftResource[]) =>
    r.map((it: DraftResource, idx: number) => (idx === i ? { ...it, ...patch } : it))
  );
}

  function removeResource(i: number) {
    const it = resources[i]
    if (it?.id) setDeletedIds(ids => [...ids, it.id!])
    setResources(r => r.filter((_, idx) => idx !== i))
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setMsg(null)

      // 1) Load line + opening
      const { data: line, error: e1 } = await supabase
        .from('lines')
        .select('id,line_name,moves_san,openings(id,name,side,deck_id)')
        .eq('id', params.id)
        .maybeSingle()

      if (e1 || !line) {
        setMsg(e1?.message || 'Line not found.')
        setLoading(false)
        return
      }

      setLineName(line.line_name ?? '')
      setMoves((line.moves_san ?? []).join(' '))
      setOpeningName(line.openings?.name ?? '')
      setSide((line.openings?.side as any) ?? 'white')

        setOpeningId(line.openings?.id ?? null)
        setOpeningDeckId(line.openings?.deck_id ?? null)

      // 2) Load resources for this line
      const { data: res } = await supabase
        .from('opening_resources')
        .select('id,kind,title,url,content,sort_order,is_active')
        .eq('line_id', params.id)
        .order('sort_order', { ascending: true })


setResources(
  (res ?? []).map((r: SupaResourceRow) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    url: r.url,
    content: r.content,
    sort_order: r.sort_order ?? 0,
    is_active: r.is_active ?? true,
  }))
);

      setLoading(false)
    }
    load()
  }, [params.id])

  const canSave = useMemo(
    () => openingName.trim().length > 0 && (moves.trim().length > 0 || lineName.trim().length > 0),
    [openingName, moves, lineName]
  )

  async function onSave() {
      if (!canSave) return
      setSaving(true); setMsg(null)

      const trimmedName = openingName.trim()
      if (!trimmedName) {
          setMsg('Opening name is required.')
          setSaving(false)
          return
      }

      const currentDeckId = openingDeckId ?? null
      let targetOpeningId = openingId ?? null

      // If we already have an opening for this line and the name didn't change,
      // just update the side and reuse the same opening/deck.
      if (targetOpeningId && trimmedName === (openingName || '').trim()) {
          const { error: updErr } = await supabase
              .from('openings')
              .update({ side })
              .eq('id', targetOpeningId)

          if (updErr) {
              setMsg(updErr.message)
              setSaving(false)
              return
          }
      } else {
          // Name changed OR we don't have an opening id yet.
          // Look for an opening with this name in the SAME deck.
          let query = supabase
              .from('openings')
              .select('id')
              .eq('name', trimmedName)

          if (currentDeckId) {
              query = query.eq('deck_id', currentDeckId)
          }

          const { data: open, error: openFindErr } = await query.maybeSingle()

          if (openFindErr && openFindErr.code !== 'PGRST116') {
              // PGRST116 is "No rows found" for maybeSingle; anything else is real error.
              setMsg(openFindErr.message)
              setSaving(false)
              return
          }

          targetOpeningId = open?.id ?? null

          if (!targetOpeningId) {
              // Create a new opening in the SAME deck as the original
              const { data: ins, error: openErr } = await supabase
                  .from('openings')
                  .insert({
                      name: trimmedName,
                      side,
                      deck_id: currentDeckId ?? null,
                  })
                  .select('id')
                  .single()

              if (openErr || !ins?.id) {
                  setMsg(openErr?.message ?? 'Failed creating opening')
                  setSaving(false)
                  return
              }

              targetOpeningId = ins.id
          } else {
              // Opening exists in this deck; just update side
              const { error: updErr } = await supabase
                  .from('openings')
                  .update({ side })
                  .eq('id', targetOpeningId)

              if (updErr) {
                  setMsg(updErr.message)
                  setSaving(false)
                  return
              }
          }
      }

      // 2) Update the existing line (safe for SRS: we DO NOT delete the line)
      const movesArray = moves.split(/\s+/).filter(Boolean)
      const { error: lineErr } = await supabase
          .from('lines')
          .update({
              opening_id: targetOpeningId,
              line_name: lineName || null,
              moves_san: movesArray,
          })
          .eq('id', params.id)

      if (lineErr) {
          setMsg('Failed updating line: ' + lineErr.message)
          setSaving(false)
          return
      }

    // 3) Delete any removed resources
    if (deletedIds.length) {
      await supabase.from('opening_resources').delete().in('id', deletedIds)
      setDeletedIds([])
    }

    // 4) Upsert current resources (assign line_id/opening_id, respect sort_order)
    if (resources.length) {
      const payload = resources.map((r, idx) => ({
        id: r.id ?? newId(),
        line_id: params.id,
        opening_id: openingId,
        kind: r.kind,
        title: r.title ?? null,
        url: r.url ?? null,
        content: r.content ?? null,
        sort_order: r.sort_order ?? idx,
        is_active: r.is_active ?? true,
      }))

      // Upsert by primary key id (ensure opening_resources has PK id default gen_random_uuid())
      
const { error: upErr } = await supabase
  .from('opening_resources')
  .upsert(payload, { onConflict: 'id' }) // explicit conflict target
  .select('id');
      if (upErr) {
        setMsg('Saved line, but resource upsert failed: ' + upErr.message)
        setSaving(false)
        return
      }
    }

    setMsg('Saved!')
    setSaving(false)
  }

  return (
    <Protected>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit Opening Line</h1>
          <button onClick={() => router.back()} className="px-3 py-1.5 rounded border hover:bg-gray-50">Back</button>
        </div>

        {loading && <div>Loading…</div>}
        {!loading && (
          <>
            <label className="block">
              <div className="text-sm text-gray-600">Opening name</div>
              <input value={openingName} onChange={e => setOpeningName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
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
              <div className="text-sm text-gray-600">Line name</div>
              <input value={lineName} onChange={e => setLineName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </label>

            <label className="block">
              <div className="text-sm text-gray-600">Moves (SAN, space-separated)</div>
              <textarea value={moves} onChange={e => setMoves(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg" />
            </label>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Resources for this line</div>
                <button onClick={addResource} className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50">
                  Add resource
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {resources.length === 0 && <div className="text-sm text-gray-500">No resources yet.</div>}
                {resources.map((r: DraftResource, i: number) => (
                  <div key={r.id ?? `new-${i}`} className="rounded border p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={r.kind}
                        onChange={e => updateResource(i, { kind: e.target.value as DraftResource['kind'] })}
                        className="px-2 py-1 border rounded"
                      >
                        <option value="text">Text</option>
                        <option value="youtube">YouTube</option>
                        <option value="image">Image (png/jpg)</option>
                        <option value="link">Link</option>
                      </select>
                      <input
                        placeholder="Title (optional)"
                        value={r.title ?? ''}
                        onChange={e => updateResource(i, { title: e.target.value })}
                        className="flex-1 px-2 py-1 border rounded"
                      />
                      <input
                        placeholder={r.kind === 'text' ? '—' : 'URL'}
                        value={r.url ?? ''}
                        onChange={e => updateResource(i, { url: e.target.value })}
                        disabled={r.kind === 'text'}
                        className="flex-1 px-2 py-1 border rounded disabled:bg-gray-50"
                      />
                    </div>
                    {r.kind === 'text' && (
                      <textarea
                        rows={3}
                        placeholder="Text content…"
                        value={r.content ?? ''}
                        onChange={e => updateResource(i, { content: e.target.value })}
                        className="w-full px-2 py-1 border rounded"
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">Order</div>
                      <input
                        type="number"
                        value={r.sort_order ?? i}
                        onChange={e => updateResource(i, { sort_order: Number(e.target.value) })}
                        className="w-20 px-2 py-1 border rounded"
                      />
                      <button onClick={() => removeResource(i)} className="text-sm px-2 py-1 border rounded hover:bg-gray-50">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={onSave}
              disabled={saving || !canSave}
              className="px-4 py-2 rounded-lg border shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>

            {msg && <div className="text-sm mt-2">{msg}</div>}
          </>
        )}
      </div>
    </Protected>
  )
}

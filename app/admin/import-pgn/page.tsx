'use client'
import Protected from '@/app/protected'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Chess } from 'chess.js'

// Simple SAN extractor: removes tags, comments, results, move numbers, and trailing NAGs (!?+#)
function extractSAN(pgn: string): string[] {
  let s = pgn.replace(/\[[^\]]*\]/g, ' ')               // PGN tags
  s = s.replace(/\{[^}]*\}/g, ' ')                      // {comments}
       .replace(/\d-\d|1-0|0-1|1\/2-1\/2|\*/g, ' ')     // results
  s = s.replace(/\d+\.(\.\.)?/g, ' ')                   // move numbers like "12." or "12..."
  const tokens = s.trim().split(/\s+/)
  return tokens.map(t => t.replace(/[!?+#]+$/,'')).filter(Boolean)
}

// Optional: validate SAN sequence with chess.js and stop at first illegal
function validateLine(sanMoves: string[]): string[] {
  const g = new Chess()
  const out: string[] = []
  for (const san of sanMoves) {
    const move = g.move(san, { sloppy: true }) // sloppy tolerates some SAN quirks
    if (!move) break
    out.push(move.san) // normalized SAN
  }
  return out
}

export default function ImportPGNPage(){
  const [openingName,setOpeningName]=useState('Imported Opening')
  const [lineName,setLineName]=useState('PGN Line')
  const [pgn,setPGN]=useState('')
  const [msg,setMsg]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)

  const onImport=async()=>{
    setSaving(true); setMsg(null)

    const rawSAN = extractSAN(pgn)
    if(!rawSAN.length){ setMsg('Could not find moves in the PGN.'); setSaving(false); return }

    const movesSAN = validateLine(rawSAN)
    if(!movesSAN.length){ setMsg('The PGN did not contain a valid first line of moves.'); setSaving(false); return }
    if(movesSAN.length < rawSAN.length){
      setMsg(`Imported ${movesSAN.length} moves (stopped at first invalid/branch).`)
    }

    // Ensure opening exists (create if missing)
    const { data: open } = await supabase.from('openings').select('id').eq('name',openingName).limit(1).maybeSingle()
    let openingId = open?.id
    if(!openingId){
      const { data: ins, error } = await supabase
        .from('openings')
        .insert({ name: openingName, side: 'both' })
        .select('id').single()
      if (error){ setMsg('Error creating opening: '+error.message); setSaving(false); return }
      openingId = ins.id
    }

    // Insert the line
    const { error: lineErr } = await supabase
      .from('lines')
      .insert({ opening_id: openingId, line_name: lineName, moves_san: movesSAN })

    if (lineErr) setMsg('Error adding line: '+lineErr.message)
    else setMsg((prev)=> (prev ? prev + ' ' : '') + 'Saved line successfully!')
    setSaving(false)
  }

  return (
    <Protected>
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-semibold">Import PGN</h1>
        <p className="text-sm text-gray-600">
          Paste a short PGN (variations in ( ) are ignored by this simple importer). We’ll extract the main line’s SAN moves.
        </p>

        <label className="block">
          <div className="text-sm text-gray-600">Opening name</div>
          <input value={openingName} onChange={e=>setOpeningName(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
        </label>

        <label className="block">
          <div className="text-sm text-gray-600">Line name</div>
          <input value={lineName} onChange={e=>setLineName(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
        </label>

        <label className="block">
          <div className="text-sm text-gray-600">PGN</div>
          <textarea
            value={pgn}
            onChange={e=>setPGN(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder='[Event "Training"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *'
          />
        </label>

        <button onClick={onImport} disabled={saving}
                className="px-4 py-2 rounded-lg border shadow-sm hover:bg-gray-50">
          {saving?'Importing…':'Import'}
        </button>

        {msg && <div className="text-sm">{msg}</div>}
      </div>
    </Protected>
  )
}

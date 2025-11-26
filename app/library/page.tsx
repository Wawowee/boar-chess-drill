'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Protected from '@/app/protected'

type Deck = { id: string; name: string; description: string | null; is_hidden: boolean }


export default function LibraryPage() {
  const [rows, setRows] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('decks')
                .select('id,name,description,is_hidden')
                .order('created_at', { ascending: true })

            const visible = ((data ?? []) as Deck[]).filter((d: Deck) => !d.is_hidden)

            setRows(visible)
            setLoading(false)
        })()
    }, [])


  async function selectDeck(deckId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/login')
    await supabase.from('user_settings').upsert({ user_id: user.id, current_deck_id: deckId })
    router.push('/drill')
  }

  return (
    <Protected>
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        {loading && <div>Loading…</div>}
        {!loading && rows.length === 0 && <div>No decks yet.</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(d => (
            <button
              key={d.id}
              onClick={() => selectDeck(d.id)}
              className="rounded-xl border bg-white hover:bg-gray-50 shadow-sm p-4 text-left"
            >
              <div className="font-semibold">{d.name}</div>
              <div className="text-sm text-gray-500">{d.description ?? '—'}</div>
            </button>
          ))}
        </div>
      </div>
    </Protected>
  )
}

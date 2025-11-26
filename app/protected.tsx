'use client'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

export default function Protected({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session ?? null); setLoading(false)
        })
        const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
        return () => { sub.subscription.unsubscribe() }
    }, [])
    if (loading) return <div className="p-4">Loading…</div>
    if (!session) { if (typeof window !== 'undefined') window.location.href = '/login'; return null }
    return <>{children}</>
}
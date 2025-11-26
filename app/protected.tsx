'use client'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'

export default function Protected({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        supabase.auth
            .getSession()
            .then(({ data }: { data: { session: Session | null } }) => {
                setSession(data.session ?? null)
                setLoading(false)
            })

        const { data: sub } = supabase.auth.onAuthStateChange(
            (_event: AuthChangeEvent, session: Session | null) => {
                setSession(session)
            }
        )

        return () => {
            sub.subscription.unsubscribe()
        }
    }, [])


    if (loading) return <div className="p-4">Loading…</div>
    if (!session) { if (typeof window !== 'undefined') window.location.href = '/login'; return null }
    return <>{children}</>
}
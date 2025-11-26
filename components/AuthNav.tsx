'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import ProfileMenu from '@/components/ProfileMenu'

export default function AuthNav() {
    const [session, setSession] = useState<Session | null>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let cleanup = () => { }

            ; (async () => {
                // 1) get current session
                const { data: { session } } = await supabase.auth.getSession()
                setSession(session)

                // 2) react to sign-in / sign-out
                const { data: sub } = supabase.auth.onAuthStateChange(
                    (_event: AuthChangeEvent, s: Session | null) => setSession(s)
                )
                cleanup = () => sub.subscription.unsubscribe()
                setReady(true)
            })()

        return () => cleanup()
    }, [])

    // avoid layout shift during first paint
    if (!ready) return null

    // Signed in? show avatar menu. Otherwise show link.
    return session
        ? <ProfileMenu />
        : <Link href="/login" className="hover:underline">Log in / Sign Up</Link>
}

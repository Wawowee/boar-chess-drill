// app/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Index() {
    const router = useRouter()

    useEffect(() => {
        let alive = true
            ; (async () => {
                const { data: { session } } = await supabase.auth.getSession()
                if (!alive) return
                router.replace(session ? '/drill' : '/tutorial')
            })()
        return () => { alive = false }
    }, [router])

    return null
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function AdminNav() {
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false

            ; (async () => {
                // You can still retrieve the user if you want to,
                // but don't early-return based on it.
                await supabase.auth.getUser()

                const { data: isAdminFlag, error } = await supabase.rpc('is_admin')

                if (cancelled) return

                if (error) {
                    console.error('is_admin RPC error in AdminNav', error)
                    setIsAdmin(false)
                } else {
                    setIsAdmin(!!isAdminFlag)
                }
            })()

        return () => {
            cancelled = true
        }
    }, [])

    // While loading or not admin, render nothing
    if (!isAdmin) return null

    // Only show for admins
    return (
        <>
            <Link
                href="/admin"
                className="hover:underline transition-transform hover:-translate-y-0.5"
            >
                Admin
            </Link>
            <Link
                href="/admin/manage-openings"
                className="hover:underline transition-transform hover:-translate-y-0.5"
            >
                Manage Openings
            </Link>
            <Link
                href="/admin/import-pgn"
                className="hover:underline transition-transform hover:-translate-y-0.5"
            >
                Import PGN
            </Link>
        </>
    )
}

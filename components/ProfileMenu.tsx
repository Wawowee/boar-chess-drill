'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function ProfileMenu() {
    const [open, setOpen] = useState(false)
    const [initial, setInitial] = useState<string>('U')
    const ref = useRef<HTMLDivElement | null>(null)
    const router = useRouter()

    // Optional: pull user initial for the bubble
    useEffect(() => {
        ; (async () => {
            const { data: { user } } = await supabase.auth.getUser()
            const letter = user?.email?.[0]?.toUpperCase() || 'U'
            setInitial(letter)
        })()
    }, [])

    // close on click outside / ESC
    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        function onEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        document.addEventListener('keydown', onEsc)
        return () => {
            document.removeEventListener('mousedown', onDocClick)
            document.removeEventListener('keydown', onEsc)
        }
    }, [])

    async function onLogout() {
        await supabase.auth.signOut()
        setOpen(false)
        router.push('/')       // or '/login' if you have a login page
        router.refresh()
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="h-9 w-9 rounded-full bg-gray-200 text-gray-800 flex items-center justify-center border hover:bg-gray-300"
                title="Profile"
            >
                {initial}
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-50"
                >
                    <Link
                        href="/settings"
                        className="block px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => setOpen(false)}
                    >
                        User settings
                    </Link>

                    <Link
                        href="/achievements"
                        className="block px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => setOpen(false)}
                    >
                        Achievements
                    </Link>

                    <button
                        onClick={onLogout}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        role="menuitem"
                    >
                        Log out
                    </button>
                </div>
            )}

        </div>
    )
}

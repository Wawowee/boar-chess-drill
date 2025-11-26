'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function LoginClient() {
    const router = useRouter()
    const qp = useSearchParams()
    const next = qp.get('next') || '/drill'

    // gate until env is available
    const [ready, setReady] = useState(false)
    useEffect(() => { setReady(!!process.env.NEXT_PUBLIC_SUPABASE_URL) }, [])

    // If already signed in, redirect. Also redirect after a successful sign-in.
    useEffect(() => {
        if (!ready) return
        let cleanup = () => { }
        ;(async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) { router.replace(next); return }
            const { data: sub } = supabase.auth.onAuthStateChange(
                (event: AuthChangeEvent, session: Session | null) => {
                    if (event === 'SIGNED_IN' && session) router.replace(next)
                }
            )
            cleanup = () => sub.subscription.unsubscribe()
        })()
        return () => cleanup()
    }, [ready, router, next])

    if (!ready) return <div className="p-6">Loading…</div>

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-semibold mb-4">Welcome to Brute Chess</h1>

            {/* Two-column layout; stacks on small screens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SignInCard next={next} />
                <SignUpCard next={next} />
            </div>
        </div>
    )
}

function SignInCard({ next }: { next: string }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [pending, setPending] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null); setPending(true)
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) setErr(error.message)
            // success path is handled by onAuthStateChange in the parent
        } finally { setPending(false) }
    }

    async function sendMagicLink() {
        setErr(null); setPending(true)
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}` }
            })
            if (error) setErr(error.message)
            else alert('Magic link sent. Check your email.')
        } finally { setPending(false) }
    }

    return (
        <div className="p-5 rounded-xl border shadow-sm bg-white dark:bg-slate-900">
            <h2 className="text-lg font-semibold mb-3">Sign in</h2>
            <form onSubmit={onSubmit} className="space-y-3">
                <div>
                    <label className="text-sm">Email</label>
                    <input
                        type="email" required autoComplete="email" autoFocus
                        value={email} onChange={e => setEmail(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
                <div>
                    <label className="text-sm">Password</label>
                    <input
                        type="password" required autoComplete="current-password"
                        value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                    <div className="text-xs mt-1">
                        <button
                            type="button"
                            className="underline text-gray-600"
                            onClick={async () => {
                                if (!email) { setErr('Enter your email first.'); return }
                                setErr(null); setPending(true)
                                try {
                                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                                        redirectTo: `${window.location.origin}/reset-password`
                                    })
                                    if (error) setErr(error.message)
                                    else alert('Password reset link sent (if the email exists).')
                                } finally { setPending(false) }
                            }}
                        >
                            Forgot password?
                        </button>
                    </div>
                </div>

                {err && <div className="text-sm text-red-600" role="alert">{err}</div>}

                <button
                    type="submit"
                    disabled={pending}
                    className="w-full py-2 rounded bg-black text-white disabled:opacity-60"
                >
                    {pending ? 'Signing in…' : 'Sign in'}
                </button>

                <button
                    type="button"
                    disabled={pending || !email}
                    onClick={sendMagicLink}
                    className="w-full py-2 rounded border disabled:opacity-60"
                >
                    {pending ? 'Sending…' : 'Send magic link'}
                </button>

                <div className="text-xs text-gray-500 text-center">
                    After sign-in you’ll go to <span className="font-mono">{next}</span>.
                </div>
            </form>
        </div>
    )
}

function SignUpCard({ next }: { next: string }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [pending, setPending] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [msg, setMsg] = useState<string | null>(null)

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null); setMsg(null)

        if (password.length < 8) {
            setErr('Password must be at least 8 characters long.')
            return
        }
        if (password !== confirm) {
            setErr('Passwords do not match.')
            return
        }

        setPending(true)
        try {
            const { error, data } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}`
                }
            })
            if (error) {
                setErr(error.message)
            } else {
                if (!data.session) {
                    setMsg('Check your email to confirm your account. You’ll be redirected after confirming.')
                } else {
                    setMsg('Account created. Redirecting…')
                }
            }
        } finally { setPending(false) }
    }

    return (
        <div className="p-5 rounded-xl border shadow-sm bg-white dark:bg-slate-900">
            <h2 className="text-lg font-semibold mb-3">Create account</h2>
            <form onSubmit={onSubmit} className="space-y-3">
                <div>
                    <label className="text-sm">Email</label>
                    <input
                        type="email" required autoComplete="email"
                        value={email} onChange={e => setEmail(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
                <div>
                    <label className="text-sm">Password</label>
                    <input
                        type="password" required autoComplete="new-password"
                        value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
                <div>
                    <label className="text-sm">Confirm password</label>
                    <input
                        type="password" required autoComplete="new-password"
                        value={confirm} onChange={e => setConfirm(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                {err && <div className="text-sm text-red-600" role="alert">{err}</div>}
                {msg && <div className="text-sm text-green-700">{msg}</div>}

                <button
                    type="submit"
                    disabled={pending}
                    className="w-full py-2 rounded bg-gray-900 text-white disabled:opacity-60"
                >
                    {pending ? 'Creating…' : 'Sign up'}
                </button>

                <div className="text-xs text-gray-500 text-center">
                    You’ll be redirected to <span className="font-mono">{next}</span> after confirming (if required).
                </div>
            </form>
        </div>
    )
}

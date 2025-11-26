'use client'

import { useEffect, useState } from 'react'
import Protected from '@/app/protected'
import { supabase } from '@/lib/supabaseClient'

type Settings = {
    bio: string
    bg_color: string
    board_light: string
    board_dark: string
    dark_mode: boolean
}

const DEFAULTS: Settings = {
    bio: '',
    bg_color: '#F0D9B5',
    board_light: '#EAEAEA',
    board_dark: '#4E6E81',
    dark_mode: false,
}

export default function SettingsPage() {
    const [uid, setUid] = useState<string | null>(null)
    const [settings, setSettings] = useState<Settings>(DEFAULTS)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)


    // put near the top of the component (below state)
    function loadThemeFromLS(): Partial<Settings> | null {
        try {
            const raw = localStorage.getItem('bc_user_theme')
            if (!raw) return null
            const s = JSON.parse(raw)
            // only accept known theme keys
            const out: Partial<Settings> = {}
            if (typeof s.bg_color === 'string') out.bg_color = s.bg_color
            if (typeof s.board_light === 'string') out.board_light = s.board_light
            if (typeof s.board_dark === 'string') out.board_dark = s.board_dark
            if (typeof s.dark_mode === 'boolean') out.dark_mode = s.dark_mode
            return out
        } catch { return null }
    }

    async function onResetTheme() {
        if (!uid) return
        // keep bio; only reset theme fields
        const next: Settings = {
            ...settings,
            bg_color: DEFAULTS.bg_color,
            board_light: DEFAULTS.board_light,
            board_dark: DEFAULTS.board_dark,
            dark_mode: DEFAULTS.dark_mode,
        }
        setSettings(next)
        applyTheme(next)
        try {
            await supabase
                .from('user_settings')
                .upsert({ user_id: uid, ...next }, { onConflict: 'user_id' })
                .select('*')
                .single()
            localStorage.setItem('bc_user_theme', JSON.stringify(next))
            setSaved(true)
            setTimeout(() => setSaved(false), 1200)
        } catch (e) {
            console.error('Reset theme failed:', e)
            alert('Could not reset theme. Please try again.')
        }
    }

    function applyTheme(s: Settings) {
        const root = document.documentElement
        root.style.setProperty('--bc-bg', s.bg_color)
        root.style.setProperty('--bc-board-light', s.board_light)
        root.style.setProperty('--bc-board-dark', s.board_dark)
        root.style.setProperty('--bc-notation', s.dark_mode ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.55)')
        root.classList.toggle('dark', !!s.dark_mode)
        try { localStorage.setItem('bc_user_theme', JSON.stringify(s)) } catch { }
    }

    // Load current user + settings
    useEffect(() => {
        let mounted = true
            ; (async () => {
                // 1) Apply whatever the app is already using (from localStorage)
                const ls = loadThemeFromLS()
                if (ls && mounted) {
                    const mergedLS: Settings = { ...DEFAULTS, ...settings, ...ls }
                    setSettings(mergedLS)
                    applyTheme(mergedLS)
                }

                // 2) Now get the signed-in user
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || !mounted) return
                setUid(user.id)

                // 3) Fetch user_settings; only override if a row exists
                const { data, error } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle()

                if (!mounted) return

                if (error) {
                    console.error('load settings error:', error)
                    return
                }

                if (data) {
                    const mergedDB: Settings = { ...DEFAULTS, ...data }
                    setSettings(mergedDB)
                    applyTheme(mergedDB)
                } else {
                    // No row yet → keep whatever we already have (possibly from LS)
                    // Optionally create the row lazily here, but not required.
                }
            })()
        return () => { mounted = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])


    async function onSave() {
        if (!uid) return
        setSaving(true); setSaved(false)

        const payload = { user_id: uid, ...settings }

        const { data: savedRow, error } = await supabase
            .from('user_settings')
            .upsert(payload, { onConflict: 'user_id' })
            .select('*')
            .single()

        setSaving(false)

        if (error) {
            console.error('Failed to save settings:', error)
            alert(`Could not save settings: ${error.message}`)
            return
        }

        const merged = { ...settings, ...(savedRow ?? {}) }
        setSettings(merged)
        applyTheme(merged)
        setSaved(true)
        setTimeout(() => setSaved(false), 1200)
    }

    return (
        <Protected>
            <div className="p-4 space-y-6">
                <h1 className="text-2xl font-semibold">User settings</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Profile (bio only) */}
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
                        <h2 className="font-medium mb-3">Profile</h2>
                        <label className="block text-sm font-medium">Bio</label>
                        <textarea
                            value={settings.bio}
                            onChange={(e) => setSettings(s => ({ ...s, bio: e.target.value }))}
                            className="mt-1 w-full rounded-lg border p-2 text-sm"
                            rows={4}
                            placeholder="Tell others a bit about you…"
                        />
                    </div>

                    {/* Theme */}
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
                        <h2 className="font-medium mb-3">Theme</h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium">Background</label>
                                <input
                                    type="color"
                                    value={settings.bg_color}
                                    onChange={(e) => {
                                        const next = { ...settings, bg_color: e.target.value }
                                        setSettings(next); applyTheme(next)
                                    }}
                                    className="mt-1 h-9 w-16 cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium">Board – light squares</label>
                                <input
                                    type="color"
                                    value={settings.board_light}
                                    onChange={(e) => {
                                        const next = { ...settings, board_light: e.target.value }
                                        setSettings(next); applyTheme(next)
                                    }}
                                    className="mt-1 h-9 w-16 cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium">Board – dark squares</label>
                                <input
                                    type="color"
                                    value={settings.board_dark}
                                    onChange={(e) => {
                                        const next = { ...settings, board_dark: e.target.value }
                                        setSettings(next); applyTheme(next)
                                    }}
                                    className="mt-1 h-9 w-16 cursor-pointer"
                                />
                            </div>

                            <div className="flex items-end">
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.dark_mode}
                                        onChange={(e) => {
                                            const next = { ...settings, dark_mode: e.target.checked }
                                            setSettings(next); applyTheme(next)
                                        }}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm font-medium">Dark mode</span>
                                </label>
                            </div>
                        </div>

                        {/* Quick 8x8 preview */}
                        <div className="mt-4 grid grid-cols-8 w-64 aspect-square overflow-hidden rounded-lg border">
                            {Array.from({ length: 64 }).map((_, i) => {
                                const r = Math.floor(i / 8), c = i % 8
                                const light = (r + c) % 2 === 0
                                const color = light ? settings.board_light : settings.board_dark
                                return <div key={i} style={{ background: color }} />
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        disabled={saving}
                        onClick={onSave}
                        className="px-4 py-2 rounded-lg border shadow-sm bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-60"
                    >
                        {saving ? 'Saving…' : 'Save settings'}
                    </button>


                    <button
                        type="button"
                        onClick={onResetTheme}
                        className="px-4 py-2 rounded-lg border shadow-sm bg-white hover:bg-gray-50"
                        title="Restore default theme (keeps your bio)"
                    >
                        Reset theme
                    </button>

                    {saved && <span className="text-sm text-gray-600">Saved ✓</span>}
                </div>
            </div>
        </Protected>
    )
}

'use client'

import { useEffect } from 'react'

export default function ThemeBoot() {
    useEffect(() => {
        try {
            const raw = localStorage.getItem('bc_user_theme')
            if (!raw) return
            const s = JSON.parse(raw) as {
                bg_color?: string; board_light?: string; board_dark?: string; dark_mode?: boolean
            }
            const root = document.documentElement
            if (s.bg_color) root.style.setProperty('--bc-bg', s.bg_color)
            if (s.board_light) root.style.setProperty('--bc-board-light', s.board_light)
            if (s.board_dark) root.style.setProperty('--bc-board-dark', s.board_dark)
            // helpful for notation/text contrast:
            root.style.setProperty('--bc-notation', s.dark_mode ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.55)')
            if (typeof s.dark_mode === 'boolean') {
                root.classList.toggle('dark', s.dark_mode)
            }
        } catch { /* ignore */ }
    }, [])

    return null
}

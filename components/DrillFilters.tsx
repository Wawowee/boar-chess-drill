'use client'
import { useEffect, useRef, useState } from 'react'

type Filters = {
    soundEnabled: boolean
    showCoords: boolean
    dailyNewCap: number
    preferSide: 'auto' | 'white' | 'black'
    boardTheme: 'classic' | 'green' | 'blue'
    studyFirst: boolean
    timePressure: boolean
}
function clampCap(n: any) {
    return Math.max(1, Math.min(90, Number(n ?? 10)))
}

export default function DrillFilters({
    open,
    onClose,
    onApply,  // (optional) parent can react to changes
    storageKey = 'bc_filters_v1',
}: {
    open: boolean
    onClose: () => void
    onApply?: (f: Filters) => void
    storageKey?: string

}) {
    function readFilters(): Filters {        // ③ move inside & use storageKey
        try {
            const raw = localStorage.getItem(storageKey)
            if (!raw) throw new Error('none')
            const f = JSON.parse(raw)
            return {
                soundEnabled: !!f.soundEnabled,
                showCoords: !!f.showCoords,
                dailyNewCap: clampCap(f.dailyNewCap),
                preferSide: (['auto', 'white', 'black'].includes(f.preferSide) ? f.preferSide : 'auto'),
                boardTheme: (['classic', 'green', 'blue'].includes(f.boardTheme) ? f.boardTheme : 'classic'),
                studyFirst: !!f.studyFirst,
                timePressure: !!f.timePressure,
            }
        } catch {
            return { soundEnabled: true, showCoords: true, dailyNewCap: 10, preferSide: 'auto', boardTheme: 'classic', studyFirst: false, timePressure: false, }
        }
    }
    function writeFilters(f: Filters) {
        try { localStorage.setItem(storageKey, JSON.stringify(f)) } catch { }
    }

    const [f, setF] = useState<Filters>(readFilters)
    const firstRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => { if (open) setTimeout(() => firstRef.current?.focus(), 0) }, [open])

    useEffect(() => {
        function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
        if (open) document.addEventListener('keydown', onEsc)
        return () => document.removeEventListener('keydown', onEsc)
    }, [open, onClose])

    function applyAndClose() {
        writeFilters(f)
        onApply?.(f)
        onClose()
    }

    if (!open) return null



    return (
        <div className="fixed inset-0 z-50">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            {/* panel */}
            <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-xl border-l rounded-none sm:rounded-l-2xl sm:top-4 sm:bottom-4 sm:right-4 sm:h-auto sm:max-h-[90vh] overflow-auto">
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Drill Filters & Settings</h2>
                    <button onClick={onClose} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">Close</button>
                </div>

                <div className="p-4 space-y-6">
                    {/* Sound */}
                    <section className="space-y-2">
                        <h3 className="font-medium">Sound</h3>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={f.soundEnabled}
                                onChange={e => setF({ ...f, soundEnabled: e.target.checked })}
                            />
                            Enable move/capture sounds
                        </label>
                    </section>

                    {/* Board — temporarily hidden */}
                    {/* Board */}
                    {false && (
                    <section className="space-y-2">
                        <h3 className="font-medium">Board</h3>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={f.showCoords}
                                onChange={e => setF({ ...f, showCoords: e.target.checked })}
                            />
                            Show coordinates (a1�h8)
                        </label>

                        <div className="text-sm">
                            <div className="mb-1">Theme</div>
                            <div className="flex gap-3">
                                {(['classic', 'green', 'blue'] as const).map(t => (
                                    <label key={t} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="boardTheme"
                                            checked={f.boardTheme === t}
                                            onChange={() => setF({ ...f, boardTheme: t })}
                                        />
                                        {t}
                                    </label>
                                ))}
                            </div>
                        </div>
                        </section>
                    )}

                    {/* Session */}
                    <section className="space-y-2">
                        <h3 className="font-medium">Session</h3>
                        <div className="text-sm">
                            <div className="mb-1">New Opening Daily Limit</div>
                            <input
                                type="number"
                                min={1}
                                max={90}
                                value={f.dailyNewCap}
                                onChange={e => setF({ ...f, dailyNewCap: Math.max(1, Math.min(90, Number(e.target.value || 10))) })}
                                className="w-24 px-2 py-1 border rounded"
                            />
                            <div className="text-xs text-gray-500 mt-1">Max new openings offered per day up to 90.</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm mt-2">
                            <input
                                type="checkbox"
                                checked={f.studyFirst}
                                onChange={e => setF({ ...f, studyFirst: e.target.checked })}
                            />
                            Study before practice
                        </label>
                        <label className="flex items-center gap-2 text-sm mt-2">
                            <input
                                type="checkbox"
                                checked={f.timePressure}
                                onChange={e => setF({ ...f, timePressure: e.target.checked })}
                            />
                            Time Pressure for recurring openings (30s)
                        </label>

                        {false && (
                        <div className="text-sm">
                            <div className="mb-1">Preferred side</div>
                            <div className="flex gap-3">
                                {(['auto', 'white', 'black'] as const).map(s => (
                                    <label key={s} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="preferSide"
                                            checked={f.preferSide === s}
                                            onChange={() => setF({ ...f, preferSide: s })}
                                        />
                                        {s}
                                    </label>
                                ))}
                            </div>
                      </div>
                        )}
                    </section>
                </div>

                <div className="p-4 border-t flex items-center gap-2">
                    <button
                        ref={firstRef}
                        onClick={applyAndClose}
                        className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        Apply
                    </button>
                    <button
                        onClick={() => { setF(readFilters()); onClose() }}
                        className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => setF({ soundEnabled: true, showCoords: true, dailyNewCap: 10, preferSide: 'auto', boardTheme: 'classic', studyFirst: false, timePressure: false, })}
                        className="ml-auto px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                    >
                        Reset defaults
                    </button>
                </div>
            </div>
        </div>
    )
}

export function readDrillFilters(storageKey = 'bc_filters_v1'): Filters {
    try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) throw new Error('none')
        const f = JSON.parse(raw)
        return {
            soundEnabled: !!f.soundEnabled,
            showCoords: !!f.showCoords,
            dailyNewCap: Math.max(1, Math.min(90, Number(f.dailyNewCap ?? 10))),
            preferSide: (['auto', 'white', 'black'].includes(f.preferSide) ? f.preferSide : 'auto'),
            boardTheme: (['classic', 'green', 'blue'].includes(f.boardTheme) ? f.boardTheme : 'classic'),
            studyFirst: !!f.studyFirst,
            timePressure: !!f.timePressure,
        }
    } catch {
        return { soundEnabled: true, showCoords: true, dailyNewCap: 10, preferSide: 'auto', boardTheme: 'classic', studyFirst: false, timePressure: false, }
    }
}


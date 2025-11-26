import { Suspense } from 'react'
import ShareClient from './ShareClient'

export default function SharePage() {
    return (
        <Suspense fallback={<div className="p-6">Loading…</div>}>
            <ShareClient />
        </Suspense>
    )
}

'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function EditPostPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const [allowed, setAllowed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [title, setTitle] = useState('')
    const [slug, setSlug] = useState('')
    const [content, setContent] = useState('')
    const [published, setPublished] = useState(true)
    const [pinned, setPinned] = useState(false)

    useEffect(() => {
        (async () => {
            // gate by admin
            const { data: isAdminFlag } = await supabase.rpc('is_admin')
            if (!isAdminFlag) { router.push('/blog'); return }

            setAllowed(true)

            // load post
            const { data, error } = await supabase
                .from('posts')
                .select('title,slug,content,published,pinned')
                .eq('id', String(id))
                .single()
            if (error || !data) { router.push('/blog'); return }

            setTitle(data.title ?? '')
            setSlug(data.slug ?? '')
            setContent(data.content ?? '')
            setPublished(!!data.published)
            setLoading(false)
            setPinned(!!data.pinned)
        })()
    }, [id, router])

    async function save() {
        if (!allowed) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('posts')
                .update({
                    title,
                    slug,
                    content,
                    published,
                    pinned,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', String(id))
            if (error) throw error
            router.push(`/blog/${slug}`)
        } finally {
            setSaving(false)
        }
    }

    if (!allowed || loading) return <div className="p-4">Loading…</div>

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-2xl font-semibold">Edit Post</h1>

            <div className="space-y-2">
                <label className="text-sm">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>

            <div className="space-y-2">
                <label className="text-sm">Slug</label>
                <input value={slug} onChange={e => setSlug(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>

            <div className="space-y-2">
                <label className="text-sm">Content (Markdown)</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={14} className="w-full px-3 py-2 border rounded-lg font-mono" />
            </div>

            <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />
                Published
            </label>

            <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
                Pin to top
            </label>

            <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50">
                    Save
                </button>
                <button onClick={() => router.push('/blog')} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
                    Cancel
                </button>
            </div>
        </div>
    )
}

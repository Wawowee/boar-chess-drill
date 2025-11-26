'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NewPostPage() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [slug, setSlug] = useState('')
    const [content, setContent] = useState('')
    const [published, setPublished] = useState(true)
    const [saving, setSaving] = useState(false)
    const [allowed, setAllowed] = useState(false)
    const [pinned, setPinned] = useState(false)

useEffect(() => {
  (async () => {
    const { data: isAdminFlag } = await supabase.rpc('is_admin');
    if (!isAdminFlag) {
      router.push('/blog'); // or show a 403 message
      return;
    }
    setAllowed(true);
  })();
}, [router]);

    async function save() {
        if (!allowed || !title.trim() || !slug.trim() || !content.trim()) return
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const { error } = await supabase.from('posts').insert({
                author_id: user?.id ?? null,
                title,
                slug,
                content,
                published,
                pinned,
            })
            if (error) throw error
            router.push('/blog')
        } finally {
            setSaving(false)
        }
    }

    function autoSlug(t: string) {
        setTitle(t)
        if (!slug) {
            setSlug(
                t.toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .trim()
                    .replace(/\s+/g, '-')
            )
        }
    }

    if (!allowed) return null

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-2xl font-semibold">New Post</h1>

            <div className="space-y-2">
                <label className="text-sm">Title</label>
                <input
                    value={title}
                    onChange={e => autoSlug(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="My opening repertoire update"
                />
            </div>

            <div className="space-y-2">
                <label className="text-sm">Slug</label>
                <input
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="my-opening-repertoire-update"
                />
                <p className="text-xs text-gray-500">Unique URL id (e.g., “how-i-use-brute-chess”).</p>
            </div>

            <div className="space-y-2">
                <label className="text-sm">Content</label>
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                    placeholder="Write your post content here (markdown/plain text)."
                />
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
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                >
                    Save
                </button>
                <button
                    onClick={() => router.push('/blog')}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    )
}

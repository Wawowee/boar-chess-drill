'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Post = {
  id: string
  title: string
  slug: string
  created_at: string
  published: boolean
  pinned: boolean
}

export default function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()

      // Check admin flag (adjust if your RPC returns a record)
      const { data: isAdminFlag } = await supabase.rpc('is_admin')
      setIsAdmin(!!isAdminFlag)

      // Load published posts, pinned first, newest first
      const { data } = await supabase
        .from('posts')
        .select('id,title,slug,created_at,published,pinned')
        .eq('published', true)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })

      setPosts((data ?? []) as Post[])
    })()
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blog</h1>
        {isAdmin && (
          <Link
            href="/admin/blog/new"
            className="px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
          >
            Add Post
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {/* Pinned tutorial card (static) */}
        <article className="border rounded-xl p-4 bg-white/90 ring-1 ring-black/5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link href="/tutorial" className="hover:underline">
              How Brute Chess Works
            </Link>
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 border border-yellow-200 text-yellow-700">
              Pinned
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">
              Tutorial
            </span>
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            A quick guide to getting started, understanding the opening deck, and how reviews are scheduled.
          </p>
          <div className="mt-2">
            <Link
              href="/tutorial"
              className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
            >
              Open tutorial
            </Link>
          </div>
        </article>

        {/* Real posts – single list only */}
        {posts.length === 0 && (
          <div className="text-gray-500">No posts yet.</div>
        )}

        {posts.map(p => (
          <article key={p.id} className="border rounded-xl p-4 bg-white/90 ring-1 ring-black/5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Link href={`/blog/${p.slug}`} className="hover:underline">{p.title}</Link>
              {p.pinned && (
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 border border-yellow-200 text-yellow-700">
                  Pinned
                </span>
              )}
            </h2>

            <div className="text-xs text-gray-500 mb-2">
              {new Date(p.created_at).toLocaleString()}
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <Link
                  href={`/admin/blog/${p.id}/edit`}
                  className="px-2 py-1 rounded border hover:bg-gray-50 text-sm"
                >
                  Edit
                </Link>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return
                    const { error } = await supabase.from('posts').delete().eq('id', p.id)
                    if (!error) setPosts(prev => prev.filter(x => x.id !== p.id))
                  }}
                  className="px-2 py-1 rounded border text-red-700 border-red-300 hover:bg-red-50 text-sm"
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

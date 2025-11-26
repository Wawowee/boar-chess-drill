'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ReactMarkdown from 'react-markdown'

type Post = {
  id: string
  title: string
  slug: string
  content: string
  created_at: string
  updated_at: string
  published: boolean
  pinned: boolean
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                // Ask DB if this user is admin (RLS-safe)
                const { data: isAdminFlag } = await supabase.rpc('is_admin');
                if (mounted) setIsAdmin(!!isAdminFlag);

                // Build the query: admins can see drafts; others only published
                let q = supabase
                    .from('posts')
                    .select('id,title,slug,content,created_at,updated_at,published,pinned')
                    .eq('slug', String(slug))
                    .maybeSingle(); // safer than .single() for 404s

                if (!isAdminFlag) {
                    q = q.eq('published', true);
                }

                const { data, error } = await q;

                if (!mounted) return;

                if (error || !data) {
                    // Not found or not allowed
                    router.replace('/blog');
                    return;
                }

                setPost(data as Post);
            } catch (e) {
                if (mounted) router.replace('/blog');
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [slug, router]);


  if (loading) {
    return (
      <div className="p-4">
        <Link href="/blog" className="text-sm text-gray-500 hover:underline">← Back to Blog</Link>
        <div className="mt-4 text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!post) return null

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/blog" className="text-sm text-gray-500 hover:underline">← Back to Blog</Link>
        {!post.published && (
          <span className="text-xs px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-yellow-700">
            Draft (unpublished)
          </span>
        )}
      </div>

      <h1 className="text-3xl font-semibold">{post.title}</h1>
      <div className="text-xs text-gray-500">
        {new Date(post.created_at).toLocaleString()}
        {post.updated_at && (
          <span> • updated {new Date(post.updated_at).toLocaleString()}</span>
        )}
      </div>

      {/* Render full content. Using pre-wrap preserves paragraphs without extra deps. */}
          <article className="prose max-w-none">
              <ReactMarkdown
              // optional plugins:
              // remarkPlugins={[remarkGfm]}
              // rehypePlugins={[rehypeRaw, rehypeSanitize]}
              >
                  {post.content}
              </ReactMarkdown>
          </article>

      {/* Optional: show admin hint / future edit link */}
          {isAdmin && post && (
              <div className="pt-4 border-t flex gap-2">
                  <Link
                      href={`/admin/blog/${post.id}/edit`}
                      className="px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                  >
                      Edit
                  </Link>

                  <button
                      onClick={async () => {
                          if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return
                          const { error } = await supabase.from('posts').delete().eq('id', post.id)
                          if (!error) router.push('/blog')
                      }}
                      className="px-3 py-2 rounded-lg border text-red-700 border-red-300 hover:bg-red-50 text-sm"
                  >
                      Delete
                  </button>
              </div>
          )}
    </div>
  )
}

# Chess Openings SRS — v0.2

Next.js + chess.js + react-chessboard, Supabase (Auth + DB), daily queue, and SRS persistence.

## 1) Install & run
```bash
npm install
npm run dev
```
Visit http://localhost:3000

## 2) Supabase setup
- Create project → copy Project URL + anon key
- Make `.env.local` from `.env.example` and fill the two values
- In Supabase SQL editor, run `supabase/schema.sql`
- Restart dev server

## 3) Auth
- Go to `/login` and sign in (magic link). All pages are protected.

## 4) Seed some lines
Use the **Admin** page to add an opening + moves (space-separated SAN).

## 5) Drill flow
- `/drill` builds a daily queue: recurring due first, then up to 10 new
- The board enforces exact moves; wrong moves flash red and let you retry
- On finish, choose **Repeat Again** or **Next Opening**; results save to `reviews` per the SRS rules
- Removed lines are marked and won’t reappear

## 6) Notes
- This is an MVP; refine queries, add user settings, branching variations, PGN import, etc.

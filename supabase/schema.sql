create table if not exists openings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  eco_code text,
  side text check (side in ('white','black','both')) default 'both',
  is_active boolean default true,
  created_at timestamptz default now()
);
create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid references openings(id) on delete cascade,
  line_name text,
  moves_san text[],
  moves_uci text[],
  starting_fen text default 'startpos',
  is_active boolean default true,
  created_at timestamptz default now()
);
create table if not exists reviews (
  user_id uuid references auth.users(id) on delete cascade,
  line_id uuid references lines(id) on delete cascade,
  status text check (status in ('new','learning','review','suspended','removed')) default 'new',
  due_on date,
  interval_days int,
  last_result text check (last_result in ('pass','fail')),
  streak int default 0,
  last_seen_at timestamptz,
  learn_bucket int,
  primary key (user_id, line_id)
);
alter table reviews enable row level security;
create policy "reviews viewable by owner" on reviews for select using (auth.uid() = user_id);
create policy "reviews insert by owner" on reviews for insert with check (auth.uid() = user_id);
create policy "reviews update by owner" on reviews for update using (auth.uid() = user_id);
create policy "reviews delete by owner" on reviews for delete using (auth.uid() = user_id);

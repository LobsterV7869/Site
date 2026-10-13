create table if not exists public.visitor_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip text,
  country text,
  path text,
  referrer text,
  user_agent text
);

create index if not exists visitor_logs_created_at_idx on public.visitor_logs (created_at desc);
create index if not exists visitor_logs_ip_idx on public.visitor_logs (ip);

alter table public.visitor_logs enable row level security;

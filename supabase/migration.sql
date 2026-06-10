-- CodeSafe — Supabase schema, row-level security, and RPC functions.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- See ARCHITECTURE.md §5 and README.md "Cloud features" for the full setup steps.

-- ============================================================ tables

create table profiles (
  id                 uuid primary key references auth.users on delete cascade,
  username           text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  account_type       text not null check (account_type in ('business', 'personal')),
  codes_created      integer not null default 0,
  last_generation_at timestamptz,
  created_at         timestamptz not null default now()
);
create unique index profiles_username_ci on profiles (lower(username));

-- Tracked QR codes only; untracked codes never touch the database.
create table qr_codes (
  short_id   text primary key check (short_id ~ '^[1-9A-HJ-NP-Za-km-z]{8}$'),
  owner      uuid not null references profiles on delete cascade,
  target_url text not null check (target_url ~* '^https?://'),
  label      text not null default '' check (length(label) <= 60),
  created_at timestamptz not null default now()
);
create index qr_codes_owner on qr_codes (owner);

create table scans (
  id          bigint generated always as identity primary key,
  short_id    text not null references qr_codes on delete cascade,
  scanned_at  timestamptz not null default now(),
  device_type text not null default 'unknown'
              check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  country     text,            -- timezone-derived country name, never an IP lookup
  is_repeat   boolean not null default false
);
create index scans_short_id on scans (short_id);

-- One row per generation by a signed-in user; powers trends, streaks, milestones.
create table creation_events (
  id         bigint generated always as identity primary key,
  owner      uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('qr', 'barcode')),
  created_at timestamptz not null default now()
);
create index creation_events_owner on creation_events (owner);

create table community_stats (
  id           int primary key default 1 check (id = 1),
  total        bigint not null default 0,
  current_goal bigint not null default 100
);
insert into community_stats default values;

create table milestones (
  goal       bigint primary key,
  reached_at timestamptz not null
);

-- ============================================================ row level security
-- The anon API key ships in the static site, so these policies ARE the
-- authorization model. Shared state (counter, scans) is writable only through
-- the security-definer functions below.

alter table profiles enable row level security;
create policy "read own profile"   on profiles for select using (auth.uid() = id);
create policy "create own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

alter table qr_codes enable row level security;
create policy "read own codes"   on qr_codes for select using (auth.uid() = owner);
create policy "create own codes" on qr_codes for insert with check (auth.uid() = owner);
create policy "update own codes" on qr_codes for update using (auth.uid() = owner);
create policy "delete own codes" on qr_codes for delete using (auth.uid() = owner);

alter table scans enable row level security;
create policy "read scans of own codes" on scans for select using (
  exists (select 1 from qr_codes c where c.short_id = scans.short_id and c.owner = auth.uid())
);
-- no insert policy: scans are written only via resolve_and_log_scan()

alter table creation_events enable row level security;
create policy "read own events"   on creation_events for select using (auth.uid() = owner);
create policy "insert own events" on creation_events for insert with check (auth.uid() = owner);

alter table community_stats enable row level security;
create policy "public stats read" on community_stats for select using (true);

alter table milestones enable row level security;
create policy "public milestones read" on milestones for select using (true);

-- ============================================================ rpc functions

-- Counts one generation. Atomically increments the community total, advances the
-- milestone ladder (100 → 1,000 → … ×10) and records milestone history, and for
-- signed-in callers appends a creation event — rate-limited to 1 per 3 seconds.
create or replace function record_generation(p_kind text)
returns table (new_total bigint, new_goal bigint, milestone_reached bigint)
language plpgsql security definer set search_path = public
as $$
declare
  v_total   bigint;
  v_goal    bigint;
  v_reached bigint := null;
  v_uid     uuid   := auth.uid();
  v_last    timestamptz;
begin
  if p_kind not in ('qr', 'barcode') then
    raise exception 'invalid kind';
  end if;

  if v_uid is not null then
    select p.last_generation_at into v_last from profiles p where p.id = v_uid;
    if v_last is not null and now() - v_last < interval '3 seconds' then
      -- Rate limited: report current stats without counting.
      select cs.total, cs.current_goal into v_total, v_goal from community_stats cs where cs.id = 1;
      return query select v_total, v_goal, v_reached;
      return;
    end if;
    update profiles p
       set codes_created = p.codes_created + 1, last_generation_at = now()
     where p.id = v_uid;
    insert into creation_events (owner, kind) values (v_uid, p_kind);
  end if;

  update community_stats cs
     set total = cs.total + 1
   where cs.id = 1
   returning cs.total, cs.current_goal into v_total, v_goal;

  if v_total >= v_goal then
    insert into milestones (goal, reached_at) values (v_goal, now())
      on conflict do nothing;
    v_reached := v_goal;
    while v_total >= v_goal loop
      v_goal := v_goal * 10;
    end loop;
    update community_stats cs set current_goal = v_goal where cs.id = 1;
  end if;

  return query select v_total, v_goal, v_reached;
end;
$$;

-- Called by s.html on every scan of a tracked code: returns the target URL and
-- logs the scan in the same round trip. Inputs are clamped server-side.
create or replace function resolve_and_log_scan(
  p_short_id text, p_device_type text, p_country text, p_repeat boolean
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_target text;
begin
  select q.target_url into v_target from qr_codes q where q.short_id = p_short_id;
  if v_target is null then
    return null;
  end if;
  insert into scans (short_id, device_type, country, is_repeat)
  values (
    p_short_id,
    case when p_device_type in ('mobile', 'tablet', 'desktop') then p_device_type else 'unknown' end,
    nullif(left(coalesce(p_country, ''), 56), ''),
    coalesce(p_repeat, false)
  );
  return v_target;
end;
$$;

grant execute on function record_generation(text) to anon, authenticated;
grant execute on function resolve_and_log_scan(text, text, text, boolean) to anon, authenticated;

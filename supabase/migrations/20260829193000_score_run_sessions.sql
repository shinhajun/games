-- Casual leaderboard integrity: every cloud submission must consume a private,
-- server-timed run. This blocks direct/replayed instant score writes and adds
-- conservative score, elapsed-time, and run-start rate limits.

alter table public.leaderboard_scores
  drop constraint if exists score_range;

alter table public.leaderboard_scores
  add constraint score_range check (
    (game in ('three-cushion', 'four-ball') and best_score between 0 and 200)
    or (game = 'yacht' and best_score between 0 and 297)
  );

create table if not exists public.arcade_runs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  game text not null check (game in ('three-cushion', 'four-ball', 'yacht')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists arcade_runs_device_started_idx
  on public.arcade_runs (device_id, game, started_at desc);

alter table public.arcade_runs enable row level security;
revoke all on public.arcade_runs from public, anon, authenticated;

create or replace function public.start_arcade_run(
  p_device_id uuid,
  p_game text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
  recent_run_count integer;
begin
  if p_game not in ('three-cushion', 'four-ball', 'yacht') then
    raise exception 'invalid game';
  end if;

  select count(*) into recent_run_count
  from public.arcade_runs
  where device_id = p_device_id
    and started_at > now() - interval '1 minute';

  if recent_run_count >= 8 then
    raise exception 'too many run starts';
  end if;

  insert into public.arcade_runs (device_id, game)
  values (p_device_id, p_game)
  returning id into new_run_id;

  return new_run_id;
end;
$$;

revoke all on function public.start_arcade_run(uuid, text) from public;
grant execute on function public.start_arcade_run(uuid, text) to anon, authenticated;

drop function if exists public.submit_arcade_score(uuid, text, text, integer, integer);

create function public.submit_arcade_score(
  p_device_id uuid,
  p_display_name text,
  p_game text,
  p_score integer,
  p_duration_ms integer,
  p_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(regexp_replace(p_display_name, '\s+', ' ', 'g'));
  run_started_at timestamptz;
  server_duration_ms integer;
  minimum_duration_ms integer;
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 16 then
    raise exception 'invalid display name';
  end if;
  if p_game not in ('three-cushion', 'four-ball', 'yacht') then
    raise exception 'invalid game';
  end if;
  if p_duration_ms < 0 or p_duration_ms > 86400000 then
    raise exception 'invalid duration';
  end if;
  if (p_game in ('three-cushion', 'four-ball') and p_score not between 0 and 200)
    or (p_game = 'yacht' and p_score not between 0 and 297) then
    raise exception 'invalid score';
  end if;

  select started_at into run_started_at
  from public.arcade_runs
  where id = p_run_id
    and device_id = p_device_id
    and game = p_game
    and submitted_at is null
  for update;

  if run_started_at is null then
    raise exception 'invalid or consumed run';
  end if;

  server_duration_ms := floor(extract(epoch from (now() - run_started_at)) * 1000)::integer;
  minimum_duration_ms := case
    when p_game = 'yacht' then 16000
    else (p_score + 5) * 400
  end;

  if server_duration_ms < minimum_duration_ms or server_duration_ms > 86400000 then
    raise exception 'implausible run duration';
  end if;

  update public.arcade_runs
  set submitted_at = now()
  where id = p_run_id;

  insert into public.leaderboard_scores (
    device_id, display_name, game, best_score, best_duration_ms, played_count, updated_at
  ) values (
    p_device_id, clean_name, p_game, p_score, server_duration_ms, 1, now()
  )
  on conflict (device_id, game) do update set
    display_name = excluded.display_name,
    best_score = greatest(leaderboard_scores.best_score, excluded.best_score),
    best_duration_ms = case
      when excluded.best_score > leaderboard_scores.best_score then excluded.best_duration_ms
      when excluded.best_score = leaderboard_scores.best_score then least(leaderboard_scores.best_duration_ms, excluded.best_duration_ms)
      else leaderboard_scores.best_duration_ms
    end,
    played_count = leaderboard_scores.played_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.submit_arcade_score(uuid, text, text, integer, integer, uuid) from public;
grant execute on function public.submit_arcade_score(uuid, text, text, integer, integer, uuid) to anon, authenticated;

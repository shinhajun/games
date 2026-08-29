-- Keep score saving reliable when a browser loses a run-start response or
-- retries a submission. Ranked rows stay private and bound to auth.uid().

alter table public.arcade_runs
  add column if not exists submitted_score integer;

create or replace function public.start_arcade_run(p_game text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  new_run_id uuid;
  recent_run_count integer;
  daily_run_count integer;
  active_run_count integer;
begin
  if requester_id is null then
    raise exception 'authentication required';
  end if;
  if p_game not in ('three-cushion', 'four-ball', 'yacht') then
    raise exception 'invalid game';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester_id::text, 0));

  delete from public.arcade_runs
  where id in (
    select id from public.arcade_runs
    where started_at < clock_timestamp() - interval '2 days'
    order by started_at
    limit 200
  );

  select count(*) into recent_run_count
  from public.arcade_runs
  where device_id = requester_id
    and started_at > clock_timestamp() - interval '1 minute';

  select count(*) into daily_run_count
  from public.arcade_runs
  where device_id = requester_id
    and started_at > clock_timestamp() - interval '1 day';

  if recent_run_count >= 60 or daily_run_count >= 1000 then
    raise exception 'too many run starts';
  end if;

  update public.arcade_runs
  set submitted_at = clock_timestamp()
  where device_id = requester_id
    and game = p_game
    and submitted_at is null;

  select count(*) into active_run_count
  from public.arcade_runs
  where device_id = requester_id
    and submitted_at is null
    and started_at > clock_timestamp() - interval '2 hours';

  if active_run_count >= 4 then
    raise exception 'too many active runs';
  end if;

  insert into public.arcade_runs (device_id, game)
  values (requester_id, p_game)
  returning id into new_run_id;

  return new_run_id;
end;
$$;

revoke all on function public.start_arcade_run(text) from public, anon;
grant execute on function public.start_arcade_run(text) to authenticated;

create or replace function public.submit_arcade_score(
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
  requester_id uuid := auth.uid();
  clean_name text := trim(regexp_replace(p_display_name, '\s+', ' ', 'g'));
  run_started_at timestamptz;
  run_submitted_at timestamptz;
  run_submitted_score integer;
begin
  if requester_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 16 then
    raise exception 'invalid display name';
  end if;
  if p_game not in ('three-cushion', 'four-ball', 'yacht') then
    raise exception 'invalid game';
  end if;
  if p_duration_ms < 0 or p_duration_ms > 7200000 then
    raise exception 'invalid duration';
  end if;
  if (p_game in ('three-cushion', 'four-ball') and p_score not between 0 and 200)
    or (p_game = 'yacht' and p_score not between 0 and 359) then
    raise exception 'invalid score';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester_id::text, 0));

  select started_at, submitted_at, submitted_score
  into run_started_at, run_submitted_at, run_submitted_score
  from public.arcade_runs
  where id = p_run_id
    and device_id = requester_id
    and game = p_game
  for update;

  if run_started_at is null then
    raise exception 'invalid run';
  end if;

  if run_submitted_at is not null then
    if run_submitted_score = p_score then
      return;
    end if;
    raise exception 'consumed run';
  end if;

  update public.arcade_runs
  set submitted_at = clock_timestamp(),
      submitted_score = p_score
  where id = p_run_id;

  insert into public.leaderboard_scores (
    device_id, display_name, game, best_score, best_duration_ms, played_count, updated_at
  ) values (
    requester_id, clean_name, p_game, p_score, p_duration_ms, 1, clock_timestamp()
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
    updated_at = clock_timestamp();
end;
$$;

revoke all on function public.submit_arcade_score(text, text, integer, integer, uuid) from public, anon;
grant execute on function public.submit_arcade_score(text, text, integer, integer, uuid) to authenticated;

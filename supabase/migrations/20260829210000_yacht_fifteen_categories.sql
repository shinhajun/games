-- Yacht now uses 15 Yatzy-style categories plus the requested 35-point
-- upper-section bonus, for a maximum possible score of 359.

alter table public.leaderboard_scores
  drop constraint if exists score_range;

alter table public.leaderboard_scores
  add constraint score_range check (
    (game in ('three-cushion', 'four-ball') and best_score between 0 and 9999)
    or (game = 'yacht' and best_score between 0 and 359)
  );

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
  server_duration_ms integer;
  minimum_duration_ms integer;
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

  select started_at into run_started_at
  from public.arcade_runs
  where id = p_run_id
    and device_id = requester_id
    and game = p_game
    and submitted_at is null
  for update;

  if run_started_at is null then
    raise exception 'invalid or consumed run';
  end if;

  server_duration_ms := floor(extract(epoch from (clock_timestamp() - run_started_at)) * 1000)::integer;
  minimum_duration_ms := case
    when p_game = 'yacht' then 20000
    else (p_score + 5) * 400
  end;

  if server_duration_ms < minimum_duration_ms or server_duration_ms > 7200000 then
    raise exception 'implausible run duration';
  end if;

  update public.arcade_runs
  set submitted_at = clock_timestamp()
  where id = p_run_id;

  insert into public.leaderboard_scores (
    device_id, display_name, game, best_score, best_duration_ms, played_count, updated_at
  ) values (
    requester_id, clean_name, p_game, p_score, server_duration_ms, 1, clock_timestamp()
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

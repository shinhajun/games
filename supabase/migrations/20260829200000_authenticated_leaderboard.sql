-- Bind ranked runs to an invisible Supabase anonymous-auth identity. The UI
-- still asks only for a display name, while callers can no longer choose or
-- impersonate the UUID that owns a leaderboard row.

delete from public.arcade_runs
where not exists (
  select 1 from auth.users where auth.users.id = arcade_runs.device_id
);

alter table public.arcade_runs
  add constraint arcade_runs_device_auth_fkey
  foreign key (device_id) references auth.users(id) on delete cascade;

create or replace view public.arcade_leaderboard as
select
  md5(device_id::text) as player_key,
  display_name,
  game,
  best_score,
  best_duration_ms,
  played_count,
  updated_at
from public.leaderboard_scores;

revoke select on public.leaderboard_scores from anon, authenticated;
grant select on public.arcade_leaderboard to anon, authenticated;

revoke all on function public.start_arcade_run(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_arcade_score(uuid, text, text, integer, integer, uuid) from public, anon, authenticated;
drop function public.start_arcade_run(uuid, text);
drop function public.submit_arcade_score(uuid, text, text, integer, integer, uuid);

create function public.start_arcade_run(p_game text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  new_run_id uuid;
  recent_run_count integer;
begin
  if requester_id is null then
    raise exception 'authentication required';
  end if;
  if p_game not in ('three-cushion', 'four-ball', 'yacht') then
    raise exception 'invalid game';
  end if;

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

  if recent_run_count >= 8 then
    raise exception 'too many run starts';
  end if;

  insert into public.arcade_runs (device_id, game)
  values (requester_id, p_game)
  returning id into new_run_id;

  return new_run_id;
end;
$$;

revoke all on function public.start_arcade_run(text) from public, anon;
grant execute on function public.start_arcade_run(text) to authenticated;

create function public.submit_arcade_score(
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
    and device_id = requester_id
    and game = p_game
    and submitted_at is null
  for update;

  if run_started_at is null then
    raise exception 'invalid or consumed run';
  end if;

  server_duration_ms := floor(extract(epoch from (clock_timestamp() - run_started_at)) * 1000)::integer;
  minimum_duration_ms := case
    when p_game = 'yacht' then 16000
    else (p_score + 5) * 400
  end;

  if server_duration_ms < minimum_duration_ms or server_duration_ms > 86400000 then
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

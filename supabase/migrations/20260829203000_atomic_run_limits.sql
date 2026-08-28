-- Serialize run starts per authenticated user, cap active/daily growth, and
-- support efficient global expiry scans.

create index if not exists arcade_runs_started_idx
  on public.arcade_runs (started_at);

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

  select count(*) into active_run_count
  from public.arcade_runs
  where device_id = requester_id
    and submitted_at is null
    and started_at > clock_timestamp() - interval '2 days';

  if recent_run_count >= 8 or daily_run_count >= 100 then
    raise exception 'too many run starts';
  end if;
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

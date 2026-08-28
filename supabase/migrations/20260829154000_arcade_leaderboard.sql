-- Hajun Arcade public leaderboard.
-- Run this file in Supabase SQL Editor, then add the project URL/anon key to .env.

create table if not exists public.leaderboard_scores (
  device_id uuid not null,
  display_name text not null check (char_length(display_name) between 2 and 16),
  game text not null check (game in ('three-cushion', 'four-ball', 'yacht')),
  best_score integer not null,
  best_duration_ms integer not null check (best_duration_ms >= 0),
  played_count integer not null default 1 check (played_count > 0),
  updated_at timestamptz not null default now(),
  primary key (device_id, game),
  constraint score_range check (
    (game in ('three-cushion', 'four-ball') and best_score between 0 and 6)
    or (game = 'yacht' and best_score between 0 and 297)
  )
);

create index if not exists leaderboard_game_rank_idx
  on public.leaderboard_scores (game, best_score desc, best_duration_ms asc);

alter table public.leaderboard_scores enable row level security;

drop policy if exists "Public leaderboard is readable" on public.leaderboard_scores;
create policy "Public leaderboard is readable"
  on public.leaderboard_scores for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.leaderboard_scores from anon, authenticated;
grant select on public.leaderboard_scores to anon, authenticated;

create or replace function public.submit_arcade_score(
  p_device_id uuid,
  p_display_name text,
  p_game text,
  p_score integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(regexp_replace(p_display_name, '\s+', ' ', 'g'));
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
  if (p_game in ('three-cushion', 'four-ball') and p_score not between 0 and 6)
    or (p_game = 'yacht' and p_score not between 0 and 297) then
    raise exception 'invalid score';
  end if;

  insert into public.leaderboard_scores (
    device_id, display_name, game, best_score, best_duration_ms, played_count, updated_at
  ) values (
    p_device_id, clean_name, p_game, p_score, p_duration_ms, 1, now()
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

revoke all on function public.submit_arcade_score(uuid, text, text, integer, integer) from public;
grant execute on function public.submit_arcade_score(uuid, text, text, integer, integer) to anon, authenticated;


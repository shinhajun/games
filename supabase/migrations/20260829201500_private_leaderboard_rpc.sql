-- Return only a stable hash of the owner ID through a narrowly scoped public
-- function; the underlying score table remains unreadable to API roles.

revoke all on public.arcade_leaderboard from public, anon, authenticated;
drop view public.arcade_leaderboard;

create function public.get_arcade_leaderboard(
  p_game text,
  p_limit integer default 20
)
returns table (
  player_key text,
  display_name text,
  game text,
  best_score integer,
  best_duration_ms integer,
  played_count integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    md5(scores.device_id::text) as player_key,
    scores.display_name,
    scores.game,
    scores.best_score,
    scores.best_duration_ms,
    scores.played_count,
    scores.updated_at
  from public.leaderboard_scores as scores
  where scores.game = p_game
    and p_game in ('three-cushion', 'four-ball', 'yacht')
  order by scores.best_score desc, scores.best_duration_ms asc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.get_arcade_leaderboard(text, integer) from public;
grant execute on function public.get_arcade_leaderboard(text, integer) to anon, authenticated;

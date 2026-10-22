-- Apply manually to the Supabase PostgreSQL identity database after approval.
-- Never apply to DuckDB. Runtime requests use only the service-role-only RPC.
begin;

create schema if not exists cdv_private;
revoke all on schema cdv_private from public, anon, authenticated;

create table cdv_private.device_challenges (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  browser_hash text not null check (browser_hash ~ '^[a-f0-9]{64}$'),
  requested_email text not null check (length(requested_email) <= 254),
  display_code text not null check (display_code ~ '^[0-9]{8}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  status text not null default 'pending' check (status in ('pending','approved','consumed','cancelled')),
  user_id uuid references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  next_poll_at timestamptz,
  consumed_at timestamptz
);
create index on cdv_private.device_challenges (expires_at);

create table cdv_private.browser_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  challenge_id text not null unique references cdv_private.device_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 hours',
  revoked_at timestamptz
);
create index on cdv_private.browser_sessions (user_id);
create index on cdv_private.browser_sessions (expires_at);

create table cdv_private.rate_buckets (
  bucket_key text primary key,
  starts_at timestamptz not null,
  hits integer not null check (hits > 0)
);

alter table cdv_private.device_challenges enable row level security;
alter table cdv_private.browser_sessions enable row level security;
alter table cdv_private.rate_buckets enable row level security;
-- No public policies: deny every operation to anon/authenticated, even if exposed accidentally.
revoke all on all tables in schema cdv_private from public, anon, authenticated;
alter default privileges in schema cdv_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema cdv_private revoke execute on functions from public, anon, authenticated;

create function cdv_private.rate(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into cdv_private.rate_buckets (bucket_key, starts_at, hits) values (p_key, now(), 1)
  on conflict (bucket_key) do update set
    hits = case when cdv_private.rate_buckets.starts_at <= now() - make_interval(secs => p_seconds)
                then 1 else cdv_private.rate_buckets.hits + 1 end,
    starts_at = case when cdv_private.rate_buckets.starts_at <= now() - make_interval(secs => p_seconds)
                    then now() else cdv_private.rate_buckets.starts_at end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function cdv_private.rate(text, integer, integer) from public, anon, authenticated;

create function public.cdv_auth(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c cdv_private.device_challenges%rowtype;
  s cdv_private.browser_sessions%rowtype;
  allowed_global boolean;
  allowed_address boolean;
  allowed_email boolean;
begin
  -- Only service_role has EXECUTE; explicit grants below avoid default PUBLIC execution.
  if p_action = 'create' then
    if coalesce(p_payload->>'address_key','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'email_key','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'id','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'browser_hash','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'display_code','') !~ '^[0-9]{8}$'
       or coalesce(p_payload->>'email','') = '' then
      return jsonb_build_object('status','invalid');
    end if;
    -- Count each limiter even when another rejects; denied requests still persist counters.
    allowed_global := cdv_private.rate('start:global', 30, 60);
    allowed_address := cdv_private.rate('start:address:' || (p_payload->>'address_key'), 10, 900);
    allowed_email := cdv_private.rate('start:email:' || (p_payload->>'email_key'), 3, 900);
    if not allowed_global or not allowed_address or not allowed_email then
      return jsonb_build_object('status','limited');
    end if;
    insert into cdv_private.device_challenges (id, browser_hash, requested_email, display_code)
    values (p_payload->>'id', p_payload->>'browser_hash', lower(p_payload->>'email'), p_payload->>'display_code')
    returning * into c;
    return jsonb_build_object('status','created','expires_at',c.expires_at);

  elsif p_action in ('callback_rate','confirmation','prepare_approval') then
    if coalesce(p_payload->>'address_key','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('status','invalid');
    end if;
    allowed_global := cdv_private.rate('confirm:global', 300, 60);
    allowed_address := cdv_private.rate('confirm:address:' || (p_payload->>'address_key'), 30, 60);
    if not allowed_global or not allowed_address then return jsonb_build_object('status','limited'); end if;
    if p_action = 'callback_rate' then return jsonb_build_object('status','ok'); end if;

    select * into c from cdv_private.device_challenges where id = p_payload->>'id' for update;
    if not found or c.expires_at <= now() or c.status <> 'pending' or c.attempts >= 5 then
      return jsonb_build_object('status','expired');
    end if;
    if p_action = 'prepare_approval' then
      update cdv_private.device_challenges set attempts = attempts + 1 where id = c.id;
      if c.display_code <> coalesce(p_payload->>'display_code','') then
        return jsonb_build_object('status','invalid');
      end if;
    end if;
    return jsonb_build_object('status','pending','email',c.requested_email,'expires_at',c.expires_at);

  elsif p_action = 'approve' then
    select * into c from cdv_private.device_challenges where id = p_payload->>'id' for update;
    if not found or c.expires_at <= now() or c.status <> 'pending'
       or c.display_code <> coalesce(p_payload->>'display_code','')
       or c.requested_email <> lower(coalesce(p_payload->>'email','')) then
      return jsonb_build_object('status','expired');
    end if;
    -- Independent DB binding: an arbitrary verified identity cannot approve someone else's email.
    if not exists (select 1 from auth.users u where u.id = (p_payload->>'user_id')::uuid
      and lower(u.email) = c.requested_email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())) then
      return jsonb_build_object('status','invalid');
    end if;
    update cdv_private.device_challenges set status = 'approved', user_id = (p_payload->>'user_id')::uuid where id = c.id;
    return jsonb_build_object('status','approved');

  elsif p_action = 'consume' then
    -- Row lock spans status transition AND session insert: two parallel polls cannot mint two sessions.
    select * into c from cdv_private.device_challenges where id = p_payload->>'id' for update;
    if not found or c.browser_hash <> coalesce(p_payload->>'browser_hash','') then
      return jsonb_build_object('status','invalid');
    end if;
    if c.expires_at <= now() or c.status = 'cancelled' then return jsonb_build_object('status','expired'); end if;
    if c.next_poll_at > now() then return jsonb_build_object('status','limited'); end if;
    update cdv_private.device_challenges set next_poll_at = now() + interval '3 seconds' where id = c.id;
    if c.status = 'pending' then return jsonb_build_object('status','pending'); end if;
    if coalesce(p_payload->>'session_hash','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid'); end if;
    if c.status = 'approved' then
      if not exists (select 1 from auth.users u where u.id = c.user_id and lower(u.email) = c.requested_email
        and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())) then
        return jsonb_build_object('status','expired');
      end if;
      insert into cdv_private.browser_sessions (token_hash, challenge_id, user_id, email)
      values (p_payload->>'session_hash', c.id, c.user_id, c.requested_email);
      update cdv_private.device_challenges set status = 'consumed', consumed_at = now() where id = c.id;
    end if;
    select * into s from cdv_private.browser_sessions where challenge_id = c.id
      and token_hash = p_payload->>'session_hash' and revoked_at is null and expires_at > now();
    if not found then return jsonb_build_object('status','expired'); end if;
    -- Retrying after a lost response returns the SAME session only; logout never resurrects it.
    return jsonb_build_object('status','approved','expires_at',s.expires_at);

  elsif p_action = 'session' then
    select bs.* into s from cdv_private.browser_sessions bs join auth.users u on u.id = bs.user_id
      where bs.token_hash = p_payload->>'session_hash' and bs.revoked_at is null and bs.expires_at > now()
      and lower(u.email) = bs.email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now());
    if not found then return jsonb_build_object('status','anonymous'); end if;
    return jsonb_build_object('status','authenticated','email',s.email);

  elsif p_action = 'logout' then
    update cdv_private.browser_sessions set revoked_at = now()
      where token_hash = p_payload->>'session_hash' and revoked_at is null;
    return jsonb_build_object('status','ok');

  elsif p_action = 'cancel' then
    select * into c from cdv_private.device_challenges where id = p_payload->>'id' for update;
    if found and c.browser_hash = coalesce(p_payload->>'browser_hash','') then
      update cdv_private.device_challenges set status = 'cancelled' where id = c.id;
      update cdv_private.browser_sessions set revoked_at = now() where challenge_id = c.id and revoked_at is null;
    end if;
    return jsonb_build_object('status','ok');
  end if;
  return jsonb_build_object('status','invalid');
end;
$$;
revoke all on function public.cdv_auth(text,jsonb) from public, anon, authenticated;
grant execute on function public.cdv_auth(text,jsonb) to service_role;

comment on function public.cdv_auth(text,jsonb) is 'Server-only identity workflow; no analytics, raw browser secrets or Supabase tokens stored.';
commit;

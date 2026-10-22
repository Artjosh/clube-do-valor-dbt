-- ADDITIVE migration; 001 remains unchanged. Identity database only.
-- No invitation secret or initial analytics grant is seeded here.
begin;

create table cdv_private.analytics_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  label text not null default 'avaliadores',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create table cdv_private.invite_claims (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  browser_hash text not null check (browser_hash ~ '^[a-f0-9]{64}$'),
  invite_id uuid not null references cdv_private.analytics_invites(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  challenge_id text unique references cdv_private.device_challenges(id) on delete cascade,
  requested_email text,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check ((challenge_id is null) = (requested_email is null))
);
create index on cdv_private.invite_claims (expires_at);
create table cdv_private.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission = 'analytics:read'),
  source_invite_id uuid not null references cdv_private.analytics_invites(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, permission)
);
create table cdv_private.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'analyst'),
  source_invite_id uuid not null references cdv_private.analytics_invites(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table cdv_private.device_challenges add column otp_attempts integer not null default 0 check (otp_attempts >= 0);

alter table cdv_private.analytics_invites enable row level security;
alter table cdv_private.invite_claims enable row level security;
alter table cdv_private.entitlements enable row level security;
alter table cdv_private.user_roles enable row level security;
revoke all on cdv_private.analytics_invites, cdv_private.invite_claims, cdv_private.entitlements, cdv_private.user_roles from public, anon, authenticated;

create function cdv_private.has_analytics(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from cdv_private.entitlements e
    join cdv_private.analytics_invites i on i.id = e.source_invite_id
    join cdv_private.user_roles r on r.user_id=e.user_id and r.role='analyst' and r.revoked_at is null
    join cdv_private.analytics_invites ri on ri.id=r.source_invite_id and ri.revoked_at is null
    where e.user_id = p_user_id and e.permission = 'analytics:read'
      and e.revoked_at is null and i.revoked_at is null
  );
$$;
revoke all on function cdv_private.has_analytics(uuid) from public, anon, authenticated;

create function public.cdv_authz(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c cdv_private.device_challenges%rowtype;
  claim cdv_private.invite_claims%rowtype;
  invitation cdv_private.analytics_invites%rowtype;
  s cdv_private.browser_sessions%rowtype;
  result jsonb;
  allowed_global boolean;
  allowed_address boolean;
  allowed_code boolean;
  permitted boolean;
begin
  if p_action = 'claim_invite' then
    if coalesce(p_payload->>'id','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'browser_hash','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'code_hash','') !~ '^[a-f0-9]{64}$'
       or coalesce(p_payload->>'address_key','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('status','invalid');
    end if;
    allowed_global := cdv_private.rate('invite:global', 60, 60);
    allowed_address := cdv_private.rate('invite:address:' || (p_payload->>'address_key'), 10, 900);
    allowed_code := cdv_private.rate('invite:code:' || (p_payload->>'code_hash'), 30, 900);
    if not allowed_global or not allowed_address or not allowed_code then return jsonb_build_object('status','limited'); end if;
    select * into invitation from cdv_private.analytics_invites where code_hash = p_payload->>'code_hash' for share;
    if not found or invitation.revoked_at is not null or invitation.expires_at <= now() then
      return jsonb_build_object('status','invalid_invite');
    end if;
    insert into cdv_private.invite_claims(id,browser_hash,invite_id)
      values(p_payload->>'id',p_payload->>'browser_hash',invitation.id) returning * into claim;
    return jsonb_build_object('status','claimed','expires_at',claim.expires_at);

  elsif p_action = 'create' then
    -- Explicit useInvite maps to a claim ID/hash from HttpOnly cookie, never the request body.
    if p_payload->>'claim_id' is not null then
      select * into claim from cdv_private.invite_claims where id = p_payload->>'claim_id' for update;
      if not found or claim.browser_hash <> coalesce(p_payload->>'claim_browser_hash','')
         or claim.expires_at <= now() or claim.revoked_at is not null or claim.consumed_at is not null
         or claim.challenge_id is not null then return jsonb_build_object('status','invalid_invite'); end if;
      select * into invitation from cdv_private.analytics_invites where id = claim.invite_id for share;
      if invitation.revoked_at is not null or invitation.expires_at <= now() then return jsonb_build_object('status','invalid_invite'); end if;
    end if;
    result := public.cdv_auth('create',p_payload);
    if result->>'status' = 'created' and claim.id is not null then
      update cdv_private.invite_claims set challenge_id=p_payload->>'id',requested_email=lower(p_payload->>'email') where id=claim.id;
    end if;
    return result;

  elsif p_action = 'prepare_otp' then
    if coalesce(p_payload->>'address_key','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid'); end if;
    allowed_global := cdv_private.rate('otp:global', 120, 60);
    allowed_address := cdv_private.rate('otp:address:' || (p_payload->>'address_key'), 20, 900);
    if not allowed_global or not allowed_address then return jsonb_build_object('status','limited'); end if;
    select * into c from cdv_private.device_challenges where id=p_payload->>'id' for update;
    if not found or c.browser_hash <> coalesce(p_payload->>'browser_hash','') then return jsonb_build_object('status','invalid'); end if;
    if c.status <> 'pending' or c.expires_at <= now() or c.otp_attempts >= 5 then return jsonb_build_object('status','expired'); end if;
    update cdv_private.device_challenges set otp_attempts=otp_attempts+1 where id=c.id;
    -- Only the verified server uses this address; client-supplied email is never trusted here.
    return jsonb_build_object('status','pending','email',c.requested_email);

  elsif p_action = 'complete_otp' then
    select * into c from cdv_private.device_challenges where id=p_payload->>'id' for update;
    if not found or c.browser_hash <> coalesce(p_payload->>'browser_hash','') then return jsonb_build_object('status','invalid'); end if;
    if c.status <> 'pending' or c.expires_at <= now() or c.otp_attempts < 1 then return jsonb_build_object('status','expired'); end if;
    result := public.cdv_auth('approve',p_payload || jsonb_build_object('display_code',c.display_code));
    if result->>'status' <> 'approved' then return result; end if;
    -- A recent GET poll cannot block the explicit OTP completion. Session creation is still atomic.
    update cdv_private.device_challenges set next_poll_at=null where id=c.id;
    return public.cdv_authz('consume',p_payload);

  elsif p_action = 'consume' then
    select * into c from cdv_private.device_challenges where id=p_payload->>'id' for update;
    if not found or c.browser_hash <> coalesce(p_payload->>'browser_hash','') then return jsonb_build_object('status','invalid'); end if;
    select * into claim from cdv_private.invite_claims where challenge_id=c.id for update;
    if claim.id is not null and claim.consumed_at is null and c.status in ('approved','consumed') then
      select * into invitation from cdv_private.analytics_invites where id=claim.invite_id for share;
      if claim.expires_at <= now() or claim.revoked_at is not null
         or invitation.revoked_at is not null or invitation.expires_at <= now()
         or claim.requested_email <> c.requested_email then return jsonb_build_object('status','invalid_invite'); end if;
    end if;
    result := public.cdv_auth('consume',p_payload);
    if result->>'status' = 'approved' then
      if claim.id is not null and claim.consumed_at is null then
        -- Unique user/permission + immutable revocation tombstone prevent regrant on replay.
        insert into cdv_private.entitlements(user_id,permission,source_invite_id)
          values(c.user_id,'analytics:read',claim.invite_id)
          on conflict(user_id,permission) do nothing;
        insert into cdv_private.user_roles(user_id,role,source_invite_id)
          values(c.user_id,'analyst',claim.invite_id) on conflict(user_id) do nothing;
        update cdv_private.invite_claims set consumed_at=now() where id=claim.id;
      end if;
      permitted := cdv_private.has_analytics(c.user_id);
      return result || jsonb_build_object('authorized',permitted,'role',case when permitted then 'analyst' else null end,
        'permissions',case when permitted then jsonb_build_array('analytics:read') else '[]'::jsonb end);
    end if;
    return result;

  elsif p_action = 'session' then
    select bs.* into s from cdv_private.browser_sessions bs join auth.users u on u.id=bs.user_id
      where bs.token_hash=p_payload->>'session_hash' and bs.revoked_at is null and bs.expires_at>now()
      and lower(u.email)=bs.email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now());
    if not found then return jsonb_build_object('status','anonymous'); end if;
    permitted := cdv_private.has_analytics(s.user_id);
    return jsonb_build_object('status','authenticated','email',s.email,'authorized',permitted,'role',case when permitted then 'analyst' else null end,
      'permissions',case when permitted then jsonb_build_array('analytics:read') else '[]'::jsonb end);

  elsif p_action = 'cancel_invite' then
    update cdv_private.invite_claims set revoked_at=now()
      where id=p_payload->>'id' and browser_hash=p_payload->>'browser_hash' and consumed_at is null;
    return jsonb_build_object('status','ok');

  elsif p_action in ('approve','prepare_approval','confirmation','callback_rate','logout','cancel') then
    return public.cdv_auth(p_action,p_payload);
  end if;
  return jsonb_build_object('status','invalid');
end;
$$;
revoke all on function public.cdv_authz(text,jsonb) from public, anon, authenticated;
grant execute on function public.cdv_authz(text,jsonb) to service_role;
comment on function public.cdv_authz(text,jsonb) is 'Server-only private analytics authorization; normal email login never grants analytics:read.';
commit;

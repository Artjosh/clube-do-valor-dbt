-- Additive: existing OTP and invitation flows remain compatible.
begin;
create function public.cdv_activate_invite(p_session_hash text, p_code_hash text, p_address_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s cdv_private.browser_sessions%rowtype;
  invitation cdv_private.analytics_invites%rowtype;
  allowed_global boolean;
  allowed_address boolean;
  allowed_session boolean;
begin
  if coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_code_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_address_key,'') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status','anonymous');
  end if;
  select bs.* into s from cdv_private.browser_sessions bs join auth.users u on u.id=bs.user_id
    where bs.token_hash=p_session_hash and bs.revoked_at is null and bs.expires_at>now()
      and lower(u.email)=bs.email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now()) for update of bs;
  if not found then return jsonb_build_object('status','anonymous'); end if;
  allowed_global := cdv_private.rate('activate:global',60,60);
  allowed_address := cdv_private.rate('activate:address:' || p_address_key,10,900);
  allowed_session := cdv_private.rate('activate:session:' || p_session_hash,10,900);
  if not allowed_global or not allowed_address or not allowed_session then
    return jsonb_build_object('status','limited');
  end if;
  select * into invitation from cdv_private.analytics_invites where code_hash=p_code_hash for share;
  if not found or invitation.revoked_at is not null or invitation.expires_at<=now() then
    return jsonb_build_object('status','invalid_invite');
  end if;
  -- Preserve revocation tombstones: a shared code must not restore revoked accounts.
  insert into cdv_private.entitlements(user_id,permission,source_invite_id)
    values(s.user_id,'analytics:read',invitation.id) on conflict(user_id,permission) do nothing;
  insert into cdv_private.user_roles(user_id,role,source_invite_id)
    values(s.user_id,'analyst',invitation.id) on conflict(user_id) do nothing;
  return jsonb_build_object('status',case when cdv_private.has_analytics(s.user_id) then 'authorized' else 'denied' end);
end;
$$;
revoke all on function public.cdv_activate_invite(text,text,text) from public,anon,authenticated;
grant execute on function public.cdv_activate_invite(text,text,text) to service_role;
commit;

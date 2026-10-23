-- Server-only preparation for automatic approval after opening the email link.
begin;
create function public.cdv_prepare_email_link(p_id text, p_address_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c cdv_private.device_challenges%rowtype;
  allowed_global boolean;
  allowed_address boolean;
begin
  if coalesce(p_id,'') !~ '^[a-f0-9]{64}$' or coalesce(p_address_key,'') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  allowed_global := cdv_private.rate('link:global',120,60);
  allowed_address := cdv_private.rate('link:address:' || p_address_key,20,60);
  if not allowed_global or not allowed_address then return jsonb_build_object('status','limited'); end if;
  select * into c from cdv_private.device_challenges where id=p_id for update;
  if not found or c.expires_at<=now() or c.status<>'pending' or c.attempts>=5 then
    return jsonb_build_object('status','expired');
  end if;
  update cdv_private.device_challenges set attempts=attempts+1 where id=c.id;
  -- This code stays server-side, for compatibility with the existing atomic approve RPC.
  return jsonb_build_object('status','pending','email',c.requested_email,'display_code',c.display_code);
end;
$$;
revoke all on function public.cdv_prepare_email_link(text,text) from public,anon,authenticated;
grant execute on function public.cdv_prepare_email_link(text,text) to service_role;
commit;

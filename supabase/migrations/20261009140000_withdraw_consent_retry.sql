-- Rettelse (reviewer): withdraw_consent() committede rækkesletningen, før filerne/kontoen blev ryddet.
-- Fejlede oprydningen (storage eller kontosletning), blev et nyt forsøg blokeret af ALREADY_WITHDRAWN,
-- og filerne/kontoen stod tilbage uden mulighed for at blive ryddet. Nu gemmes et oprydnings-flag og de
-- slettede filstier på samtykke-rækken, så et nyt forsøg på withdraw_consent() kan gentage oprydningen,
-- indtil TS-laget bekræfter den med confirm_consent_cleanup() (kun for image_upload; ai_processing har
-- intet at bekræfte, da hele kontoen slettes ved succes, hvorved rækken selv forsvinder via cascade).

alter table public.consents add column if not exists pending_storage_paths text[] null;
alter table public.consents add column if not exists cleanup_done boolean not null default true;

create or replace function public.withdraw_consent(p_consent_id uuid)
returns table (withdrawn_at timestamptz, consent_type public.consent_type, deleted_image_paths text[], closed_conversations integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_consent public.consents%rowtype;
  v_at timestamptz := now();
  v_paths text[] := '{}';
  v_closed integer := 0;
  v_pending boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_consent from public.consents where id = p_consent_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_consent.withdrawn_at is not null then
    if v_consent.cleanup_done then
      raise exception 'ALREADY_WITHDRAWN' using errcode = 'P0001';
    end if;
    -- Oprydningen efter forrige forsøg er ikke bekræftet. Gentag den samme oprydning (idempotent) uden at
    -- røre withdrawn_at, så API'et kan prøve igen med de samme filstier.
    if v_consent.type = 'ai_processing' then
      with c as (
        update public.ai_conversations
           set status = 'closed'
         where patient_id = v_uid and status = 'active'
        returning 1
      )
      select count(*) into v_closed from c;
    end if;
    return query
      select v_consent.withdrawn_at, v_consent.type, coalesce(v_consent.pending_storage_paths, '{}'), v_closed;
    return;
  end if;

  update public.consents set withdrawn_at = v_at where id = p_consent_id;

  if v_consent.type = 'image_upload' then
    with d as (
      delete from public.request_images where patient_id = v_uid returning storage_path
    )
    select coalesce(array_agg(d.storage_path), '{}') into v_paths from d;
  elsif v_consent.type = 'ai_processing' then
    with c as (
      update public.ai_conversations
         set status = 'closed'
       where patient_id = v_uid and status = 'active'
      returning 1
    )
    select count(*) into v_closed from c;
  end if;

  -- Først nu afgøres om der er oprydning tilbage, som TS-laget skal udføre (filer eller kontosletning).
  v_pending := (v_consent.type = 'image_upload' and coalesce(array_length(v_paths, 1), 0) > 0)
            or (v_consent.type = 'ai_processing' and not public.is_permanent_user());

  update public.consents
     set pending_storage_paths = case when v_consent.type = 'image_upload' then v_paths else null end,
         cleanup_done = not v_pending
   where id = p_consent_id;

  return query select v_at, v_consent.type, v_paths, v_closed;
end;
$fn$;

revoke all on function public.withdraw_consent(uuid) from public, anon;
grant execute on function public.withdraw_consent(uuid) to authenticated;

-- Kaldes af serveren, når billedfilerne er fjernet fra storage. Kun ejeren kan bekræfte sin egen oprydning.
create or replace function public.confirm_consent_cleanup(p_consent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  update public.consents
     set cleanup_done = true, pending_storage_paths = null
   where id = p_consent_id and patient_id = v_uid;
end;
$fn$;

revoke all on function public.confirm_consent_cleanup(uuid) from public, anon;
grant execute on function public.confirm_consent_cleanup(uuid) to authenticated;

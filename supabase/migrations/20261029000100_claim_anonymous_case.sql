-- Overdragelse af en anonym kladde til en eksisterende patientkonto (architecture 7.7, 10.2).
-- En patient, der har chattet anonymt og derefter logger ind på en konto, der allerede findes, får kladden flyttet over:
-- sagen med chat, billeder, bekræftede ydelser, opsummering, tid og postnummer, og de samtykker der blev givet anonymt.
--
-- Sikkerhed: det anonyme id og et gættet sags-id giver aldrig adgang. Den anonyme session udsteder selv et kortlivet
-- engangs-token (issue_claim_token(), kun den anonyme bruger, kun et hash gemmes). Den indloggede patient indløser det
-- (claim_anonymous_case()). Det anonyme adgangstoken forlader aldrig appen. Alt sker i én transaktion.

create table public.anonymous_claims (
  token_hash text primary key check (char_length(token_hash) = 64),
  anon_id uuid not null,  -- bevidst uden FK: rækken skal overleve, at den anonyme bruger slettes (idempotens)
  expires_at timestamptz not null,
  claimed_by uuid null,
  claimed_case_id uuid null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index anonymous_claims_anon_idx on public.anonymous_claims (anon_id);

-- Kun funktionerne nedenfor (security definer) rører tabellen.
alter table public.anonymous_claims enable row level security;
revoke all on public.anonymous_claims from public, anon, authenticated, service_role;

-- cases_guard() og ai_conversations_before_update(): patient_id må kun ændres af claim_anonymous_case()
-- (transaktionsflag tm.claim), og kun fra en anonym ejer. Ellers uændret.
create or replace function public.cases_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('tm.system', true), '') = 'on';
  v_claim boolean := coalesce(current_setting('tm.claim', true), '') = 'on';
  v_anonymous boolean;
begin
  if tg_op = 'INSERT' then
    if not v_system and (
         new.status <> 'draft' or new.ai_summary is not null or new.ai_model is not null
      or new.ai_prompt_version is not null or new.ai_generation_count <> 0 or new.summary_text is not null
      or new.summary_ai_assisted or new.summary_approved_at is not null or new.sharing_consent_id is not null
      or new.submitted_at is not null or new.closed_at is not null
    ) then
      raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
    end if;
    select p.is_anonymous into v_anonymous from public.profiles p where p.id = new.patient_id;
    if coalesce(v_anonymous, false) then
      if new.is_emergency then
        raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
      end if;
      if exists (select 1 from public.cases c where c.patient_id = new.patient_id and c.status = 'draft') then
        raise exception 'DRAFT_LIMIT' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if new.patient_id is distinct from old.patient_id and not (
       v_claim
       and old.status = 'draft'
       and coalesce((select p.is_anonymous from public.profiles p where p.id = old.patient_id), false)
       and not coalesce((select p.is_anonymous from public.profiles p where p.id = new.patient_id), true)
     ) then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.is_emergency is distinct from old.is_emergency or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if not v_system and (
       new.status is distinct from old.status
    or new.ai_summary is distinct from old.ai_summary
    or new.ai_model is distinct from old.ai_model
    or new.ai_prompt_version is distinct from old.ai_prompt_version
    or new.ai_generation_count is distinct from old.ai_generation_count
    or new.summary_text is distinct from old.summary_text
    or new.summary_ai_assisted is distinct from old.summary_ai_assisted
    or new.summary_approved_at is distinct from old.summary_approved_at
    or new.sharing_consent_id is distinct from old.sharing_consent_id
    or new.submitted_at is distinct from old.submitted_at
    or new.closed_at is distinct from old.closed_at
  ) then
    raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ai_conversations_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim boolean := coalesce(current_setting('tm.claim', true), '') = 'on';
begin
  if new.patient_id is distinct from old.patient_id and not (
       v_claim
       and coalesce((select p.is_anonymous from public.profiles p where p.id = old.patient_id), false)
       and not coalesce((select p.is_anonymous from public.profiles p where p.id = new.patient_id), true)
     ) then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.case_id is distinct from old.case_id
     or new.ai_consent_id is distinct from old.ai_consent_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if new.user_message_count < old.user_message_count or new.user_message_count > old.user_message_count + 1 then
    raise exception 'Ugyldig tæller' using errcode = '42501';
  end if;
  if old.status = 'closed' and new.status = 'active' then
    raise exception 'En lukket samtale kan ikke genåbnes' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- issue_claim_token(): den anonyme bruger udsteder et engangs-token (15 minutter). Et tidligere ubrugt token fra samme
-- bruger erstattes. Tokenet returneres kun her; databasen gemmer kun dets sha256-hash.
create function public.issue_claim_token()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  -- Kun en bruger, der stadig er anonym (databasens profil, ikke JWT'ens påstand).
  if not coalesce((select p.is_anonymous from public.profiles p where p.id = v_uid), false) then
    raise exception 'NOT_ANONYMOUS' using errcode = '42501';
  end if;

  delete from public.anonymous_claims
   where created_at < now() - interval '1 day' or (anon_id = v_uid and claimed_by is null);

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.anonymous_claims (token_hash, anon_id, expires_at)
  values (encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_uid, v_expires);
  update public.profiles set last_active_at = now() where id = v_uid;
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

-- claim_anonymous_case(): den indloggede patient indløser tokenet. Flytter den anonyme brugers kladde (hvis den har
-- indhold) til sig selv: sag, samtale, beskeder, billeder (stien {case_id}/... er uændret) og samtykker. Idempotent for
-- samme patient og token. Den anonyme bruger slettes bagefter af serveren (service role, 2.3 f).
-- Patientens egne sager røres ikke: har patienten allerede en kladde, bliver den anonyme en ekstra sag ved siden af.
create function public.claim_anonymous_case(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_claim public.anonymous_claims%rowtype;
  v_case_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role <> 'patient' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_profile.is_anonymous then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 32 and 128 then
    raise exception 'CLAIM_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim from public.anonymous_claims
   where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
   for update;
  if not found then
    raise exception 'CLAIM_INVALID' using errcode = 'P0001';
  end if;
  if v_claim.claimed_by is not null then
    -- Samme patient igen: samme svar, men uden anon_id (sletningen af den anonyme bruger gentages ikke; den ryddes
    -- ellers af oprydningsjobbet efter 48 timer). Andre får intet at vide.
    if v_claim.claimed_by = v_uid then
      return jsonb_build_object('case_id', v_claim.claimed_case_id, 'moved', v_claim.claimed_case_id is not null, 'already_claimed', true);
    end if;
    raise exception 'CLAIM_INVALID' using errcode = 'P0001';
  end if;
  if v_claim.expires_at <= now() or v_claim.anon_id = v_uid then
    raise exception 'CLAIM_INVALID' using errcode = 'P0001';
  end if;
  -- Afsenderen skal stadig være en anonym bruger; en konto, der er blevet permanent, kan ikke overdrages.
  perform 1 from public.profiles p where p.id = v_claim.anon_id and p.is_anonymous and p.role = 'patient' for update;
  if not found then
    raise exception 'CLAIM_INVALID' using errcode = 'P0001';
  end if;

  -- Kun en kladde med indhold flyttes; en tom kladde følger med den anonyme bruger ved sletning.
  select c.id into v_case_id
    from public.cases c
   where c.patient_id = v_claim.anon_id and c.status = 'draft'
     and (c.postal_code is not null or c.preferred_timeframe is not null or c.ai_summary is not null
          or exists (select 1 from public.case_services s where s.case_id = c.id)
          or exists (select 1 from public.case_images i where i.case_id = c.id)
          or exists (select 1 from public.ai_conversations v join public.ai_messages m on m.conversation_id = v.id
                      where v.case_id = c.id))
   order by c.created_at desc
   limit 1
   for update;

  if v_case_id is not null then
    perform set_config('tm.claim', 'on', true);
    update public.cases set patient_id = v_uid where id = v_case_id;
    update public.ai_conversations set patient_id = v_uid where case_id = v_case_id;
    update public.ai_messages set patient_id = v_uid
     where conversation_id in (select id from public.ai_conversations where case_id = v_case_id);
    update public.case_images set patient_id = v_uid where case_id = v_case_id;
    -- Samtykkerne (ai_processing, image_upload) bevares med granted_while_anonymous = true. Samtale og billeder
    -- peger på dem.
    update public.consents set patient_id = v_uid where patient_id = v_claim.anon_id;
    perform set_config('tm.claim', '', true);
  end if;

  update public.anonymous_claims
     set claimed_by = v_uid, claimed_case_id = v_case_id, claimed_at = now()
   where token_hash = v_claim.token_hash;
  return jsonb_build_object('case_id', v_case_id, 'moved', v_case_id is not null, 'already_claimed', false,
                            'anon_id', v_claim.anon_id);
end;
$$;

revoke all on function public.issue_claim_token() from public, anon;
revoke all on function public.claim_anonymous_case(text) from public, anon;
grant execute on function public.issue_claim_token() to authenticated;
grant execute on function public.claim_anonymous_case(text) to authenticated;

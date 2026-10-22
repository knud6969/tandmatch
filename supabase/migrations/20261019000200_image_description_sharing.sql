-- 3.6b B2: AI'ens billedbeskrivelser deles kun med klinikken, når patienten har godkendt opsummeringen EFTER
-- beskrivelsen blev skrevet (architecture 4.3 case_images). En ny generering, et nyt billede eller en ny chatbesked
-- nulstiller godkendelsen eller giver beskrivelsen et nyere tidspunkt, så patienten skal godkende igen.
-- Også: approve_summary() sætter summary_ai_assisted (false, når patienten har erstattet AI-teksten helt).

alter table public.case_images add column ai_described_at timestamptz null;

-- Tidspunktet sættes af databasen, hver gang ai_description skrives (også med samme tekst) og ved indsættelse med
-- beskrivelse. Ingen klient kan sætte det: kun service role skriver til case_images.
create function public.case_images_stamp_description()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.ai_described_at := case when new.ai_description is null then null else now() end;
  return new;
end;
$$;
revoke all on function public.case_images_stamp_description() from public, anon, authenticated;

create trigger case_images_stamp_description_insert
  before insert on public.case_images
  for each row when (new.ai_description is not null)
  execute function public.case_images_stamp_description();

create trigger case_images_stamp_description_update
  before update of ai_description on public.case_images
  for each row execute function public.case_images_stamp_description();

-- Eksisterende beskrivelser får ingen tidsstempel og er derfor skjult for klinikken, til opsummeringen genereres og
-- godkendes igen (fail closed).

-- Billeder til klinikken: som før, men beskrivelsen kun efter godkendelse (summary_approved_at >= ai_described_at).
create or replace function public.clinic_lead_images(p_lead_id uuid)
returns table (
  image_id uuid,
  storage_path text,
  approved_description text,
  width integer,
  height integer
)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.storage_path,
         case when c.summary_approved_at is not null and i.ai_described_at is not null
                   and c.summary_approved_at >= i.ai_described_at
              then i.ai_description end,
         i.width, i.height
    from public.leads l
    join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
      and l.sent_at >= k.owner_since
    join public.cases c on c.id = l.case_id
    join public.case_images i on i.case_id = c.id
   where l.id = p_lead_id
     and l.status <> 'withdrawn'
     and c.status <> 'draft'
     and coalesce((
           select k2.withdrawn_at is null
             from public.consents k2
            where k2.patient_id = c.patient_id and k2.type = 'image_upload'
            order by k2.created_at desc limit 1
         ), false)
   order by i.created_at;
$$;

-- approve_summary() får et valgfrit felt: om den godkendte tekst stadig bygger på AI-udkastet. Uden et AI-udkast på
-- sagen er svaret altid false; uden angivelse bevares den eksisterende værdi.
drop function public.approve_summary(uuid, text);
create function public.approve_summary(p_case_id uuid, p_summary_text text, p_ai_assisted boolean default null)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_case public.cases%rowtype;
  v_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_summary_text is null or char_length(btrim(p_summary_text)) = 0 or char_length(p_summary_text) > 1500 then
    raise exception 'INVALID_SUMMARY' using errcode = '22023';
  end if;
  select * into v_case from public.cases where id = p_case_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases
     set summary_text = p_summary_text,
         summary_approved_at = v_at,
         summary_ai_assisted = v_case.ai_summary is not null and coalesce(p_ai_assisted, v_case.summary_ai_assisted)
   where id = p_case_id;
  perform set_config('tm.system', '', true);
  return v_at;
end;
$$;
revoke all on function public.approve_summary(uuid, text, boolean) from public, anon;
grant execute on function public.approve_summary(uuid, text, boolean) to authenticated;

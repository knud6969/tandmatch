-- 1.9.1 del 4: sletning af en klinikkonto i triggeren (security H2/M4, architecture 5.3, 10.8).
-- Hele rækkeoprydningen ligger i clinics_after_owner_removed(), så den er atomar og også virker, når en konto slettes
-- uden om API'et. Service role bruges kun til filer og auth-bruger.
--  - Altid først: åbne leads afvises med clinic_left, reservationer frigives og fremtidige bookinger aflyses.
--  - Importeret klinik (import_source is not null): bliver 'imported' med bevarede grunddata; alt klinikken selv har
--    lagt ind slettes (prisliste, valgte kategorier, blokeringer, tandlæger/portefølje, logo, beskrivelse, e-mail,
--    website og klinikindtastet Trustpilot).
--  - Klinik uden import_source: afventer beslutning (åbent spørgsmål 28); behandles indtil videre som importeret.

create or replace function public.clinics_after_owner_removed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Altid først: reservationer frigives, fremtidige bookinger aflyses, åbne leads afvises.
  update public.bookings
     set status = 'cancelled', cancelled_by = 'clinic', cancelled_at = now()
   where clinic_id = new.id and (status = 'held' or (status = 'booked' and starts_at > now()));
  update public.leads
     set status = 'declined', decline_reason = 'clinic_left', responded_at = now()
   where clinic_id = new.id
     and (status in ('sent', 'accepted')
          or (status = 'booked' and not exists (
                select 1 from public.bookings b where b.lead_id = leads.id and b.status in ('held', 'booked', 'completed'))));

  -- Grunddata bevares, det klinikken selv har lagt ind slettes.
  -- [AFVENTER BRUGERENS BESLUTNING, åbent spørgsmål 28] En klinik uden import_source behandles indtil videre som en
  -- importeret (rækken bevares som 'imported'). Hel sletning af selvoprettede klinikker er ikke bygget.
  delete from public.clinic_prices where clinic_id = new.id;
  delete from public.clinic_service_groups where clinic_id = new.id;
  delete from public.clinic_time_blocks where clinic_id = new.id;
  delete from public.clinic_dentists where clinic_id = new.id; -- portfolio_items følger med via cascade
  update public.clinics
     set description = null,
         logo_path = null,
         logo_updated_at = null,
         email = null,
         website = null,
         trustpilot_url = case when trustpilot_entered_by = 'clinic' then null else trustpilot_url end,
         trustpilot_score = case when trustpilot_entered_by = 'clinic' then null else trustpilot_score end,
         trustpilot_review_count = case when trustpilot_entered_by = 'clinic' then null else trustpilot_review_count end,
         trustpilot_updated_at = case when trustpilot_entered_by = 'clinic' then null else trustpilot_updated_at end,
         trustpilot_entered_by = case when trustpilot_entered_by = 'clinic' then null else trustpilot_entered_by end
   where id = new.id;
  return null;
end;
$$;

revoke all on function public.clinics_after_owner_removed() from public, anon, authenticated;

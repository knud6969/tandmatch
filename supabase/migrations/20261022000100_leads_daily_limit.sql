-- Trin 4.5a (security M1): døgnloft for leads pr. patient (architecture 7.6).
-- Højst 15 leads pr. patient inden for rullende 24 timer, uanset sag og status (afviste og tilbagetrukne tæller med),
-- så en patient ikke kan spamme klinikkerne med nye sager. Spejles af MAX_LEADS_PER_PATIENT_DAY i lib/constants/limits.ts.

create function public.leads_daily_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_patient uuid;
begin
  select c.patient_id into v_patient from public.cases c where c.id = new.case_id;
  -- Samtidige afsendelser fra samme patient tælles efter hinanden.
  perform pg_advisory_xact_lock(hashtextextended('leads_daily_limit:' || v_patient::text, 0));
  if (select count(*)
        from public.leads l
        join public.cases c on c.id = l.case_id
       where c.patient_id = v_patient
         and l.sent_at > now() - interval '24 hours') >= 15 then
    raise exception 'LEAD_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger leads_daily_limit
  before insert on public.leads
  for each row execute function public.leads_daily_limit();

revoke all on function public.leads_daily_limit() from public, anon, authenticated;

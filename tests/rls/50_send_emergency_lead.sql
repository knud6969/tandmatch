-- Test 50 (arbejdsplan 7.3, architecture 5.3, 5.6 punkt 51, 10.11, migrationerne 20261028000300 og 20261113000100):
-- send_emergency_lead() afviser anonym, ikke-akut ydelse, manglende samtykke, ikke-verificeret klinik, ugyldig telefon, ugyldig
-- beskrivelse og ukendt postnummer, uden at efterlade en halv sag; ved succes er sagen submitted + is_emergency med godkendt
-- opsummering og ét lead uden tid (ingen booking), og kontakten ligger på leadet. Klinikken ser leadet uden kontaktfelter.
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.emg(p_clinic text, p_service text, p_desc text default 'Jeg har slemme smerter i en kindtand.',
                       p_name text default 'Alma Test', p_phone text default '+45 12345678', p_postal text default null)
returns text language plpgsql as $$
begin
  perform * from public.send_emergency_lead(tt.cid(p_clinic), tt.svc(p_service), p_desc, p_name, p_phone, p_postal);
  return 'ok';
end $$;
grant execute on function tt.emg(text, text, text, text, text, text) to public;

-- Anonym bruger
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select tt.emg(%L, %L)', 'Z', 'akut_konsultation'), 'anonym afvises', 'ACCOUNT_REQUIRED');
-- Uden samtykke (pC)
select tt.as_user(tt.id('pC'));
select tt.denied(format('select tt.emg(%L, %L)', 'Z', 'akut_konsultation'), 'manglende health_data_sharing', 'CONSENT_REQUIRED');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pC'))::int, 0, 'pC: ingen halv sag efter CONSENT_REQUIRED');

-- pA med samtykke
select tt.as_user(tt.id('pA'));
select tt.denied(format('select tt.emg(%L, %L)', 'Z', 'undersoegelse'), 'ikke-akut ydelse afvises', 'INVALID_SERVICE');
select tt.denied(format('select tt.emg(%L, %L)', 'R', 'akut_konsultation'), 'ikke-verificeret klinik afvises', 'CLINIC_NOT_AVAILABLE');
select tt.denied(format('select tt.emg(%L, %L, p_phone => %L)', 'Z', 'akut_konsultation', '1234567'), 'telefon under 8 cifre', 'INVALID_CONTACT');
select tt.denied(format('select tt.emg(%L, %L, p_name => %L)', 'Z', 'akut_konsultation', 'A'), 'for kort navn', 'INVALID_CONTACT');
select tt.denied(format('select tt.emg(%L, %L, p_desc => %L)', 'Z', 'akut_konsultation', 'for kort'), 'for kort beskrivelse', 'INVALID_INPUT');
select tt.denied(format('select tt.emg(%L, %L, p_postal => %L)', 'Z', 'akut_konsultation', '0001'), 'ukendt postnummer', 'UNKNOWN_POSTAL_CODE');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pA') and is_emergency)::int, 0, 'ingen akutsag efter afvisninger');
select tt.eq((select count(*) from public.leads l join public.cases c on c.id = l.case_id where c.is_emergency and l.clinic_id = tt.cid('Z'))::int, 0, 'ingen akut-leads efter afvisninger');

-- Succes
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select tt.emg(%L, %L, p_postal => %L)', 'Z', 'akut_konsultation', '2100'), 'pA sender akut-lead');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pA') and is_emergency and status = 'submitted' and summary_approved_at is not null and summary_text is not null and postal_code = '2100')::int, 1, 'akutsagen er submitted med godkendt opsummering');
select tt.eq((select count(*) from public.case_services cs join public.cases c on c.id = cs.case_id where c.is_emergency and c.patient_id = tt.id('pA') and cs.service_id = tt.svc('akut_konsultation'))::int, 1, 'ydelsen er bekræftet');
select tt.eq((select count(*) from public.bookings b where b.clinic_id = tt.cid('Z'))::int, 0, 'ingen booking: klinikken foreslår tiden');
select tt.eq((select l.contact_name || ' ' || l.contact_phone from public.leads l join public.cases c on c.id = l.case_id
               where c.is_emergency and c.patient_id = tt.id('pA')), 'Alma Test +45 12345678', 'kontakten er gemt på leadet');
select tt.eq((select l.requested_starts_at from public.leads l join public.cases c on c.id = l.case_id
               where c.is_emergency and c.patient_id = tt.id('pA')), null::timestamptz, 'ingen ønsket tid');

-- Patienten kan læse sin egen kontakt på leadet; klinikken har ingen SELECT på leads
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.leads where contact_phone is not null)::int, 1, 'patienten læser sit eget akut-lead');
select tt.as_user(tt.id('uZ'));
select tt.eq((select count(*) from public.leads)::int, 0, 'klinikken kan ikke læse leads-tabellen');

-- Klinikken ser akut-leadet uden kontaktfelter, før tiden er bekræftet
select tt.eq((select count(*) from public.clinic_leads() where is_emergency)::int, 1, 'klinik Z ser akut-leadet');
select tt.eq((select contact_name from public.clinic_lead_detail((select lead_id from public.clinic_leads() where is_emergency limit 1))), null, 'ingen kontaktnavn før bekræftet tid');
-- Klinik X ser det ikke
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_leads() where is_emergency)::int, 0, 'klinik X ser ikke Zs akut-lead');

-- Funktionen er ikke kaldbar for anon
select tt.as_anon();
select tt.denied(format('select tt.emg(%L, %L)', 'Z', 'akut_konsultation'), 'anon-rollen kan ikke kalde funktionen');

rollback;

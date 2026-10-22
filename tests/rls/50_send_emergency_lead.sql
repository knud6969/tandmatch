-- Test 50 (arbejdsplan 7.3, architecture 5.3, 5.6 punkt 51, 10.11, migration 20261028000300):
-- send_emergency_lead() afviser anonym, ikke-akut ydelse, manglende samtykke, ikke-verificeret klinik, tid uden for vinduet,
-- ugyldig telefon, ugyldig beskrivelse og ukendt postnummer; ved SLOT_TAKEN findes ingen halv sag; ved succes er sagen
-- submitted + is_emergency med godkendt opsummering, ét lead og en held-booking; klinikken ser leadet uden kontaktfelter.
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.emg(p_clinic text, p_service text, p_starts timestamptz, p_desc text default 'Jeg har slemme smerter i en kindtand.',
                       p_name text default 'Alma Test', p_phone text default '+45 12345678', p_postal text default null)
returns text language plpgsql as $$
begin
  perform * from public.send_emergency_lead(tt.cid(p_clinic), tt.svc(p_service), p_starts, p_desc, p_name, p_phone, p_postal);
  return 'ok';
end $$;
grant execute on function tt.emg(text, text, timestamptz, text, text, text, text) to public;

-- Anonym bruger
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'akut_konsultation', tt.slot(3, 18)), 'anonym afvises', 'ACCOUNT_REQUIRED');
-- Uden samtykke (pC)
select tt.as_user(tt.id('pC'));
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'akut_konsultation', tt.slot(3, 18)), 'manglende health_data_sharing', 'CONSENT_REQUIRED');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pC'))::int, 0, 'pC: ingen halv sag efter CONSENT_REQUIRED');

-- pA med samtykke
select tt.as_user(tt.id('pA'));
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'undersoegelse', tt.slot(3, 18)), 'ikke-akut ydelse afvises', 'INVALID_SERVICE');
select tt.denied(format('select tt.emg(%L, %L, %L)', 'R', 'akut_konsultation', tt.slot(3, 18)), 'ikke-verificeret klinik afvises', 'CLINIC_NOT_AVAILABLE');
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'akut_konsultation', tt.slot(3, 22)), 'tid uden for åbnings- og akutvindue afvises', 'SLOT_UNAVAILABLE');
select tt.denied(format('select tt.emg(%L, %L, %L, p_phone => %L)', 'Z', 'akut_konsultation', tt.slot(3, 18), '1234567'), 'telefon under 8 cifre', 'INVALID_CONTACT');
select tt.denied(format('select tt.emg(%L, %L, %L, p_name => %L)', 'Z', 'akut_konsultation', tt.slot(3, 18), 'A'), 'for kort navn', 'INVALID_CONTACT');
select tt.denied(format('select tt.emg(%L, %L, %L, p_desc => %L)', 'Z', 'akut_konsultation', tt.slot(3, 18), 'for kort'), 'for kort beskrivelse', 'INVALID_INPUT');
select tt.denied(format('select tt.emg(%L, %L, %L, p_postal => %L)', 'Z', 'akut_konsultation', tt.slot(3, 18), '0001'), 'ukendt postnummer', 'UNKNOWN_POSTAL_CODE');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pA') and is_emergency)::int, 0, 'ingen akutsag efter afvisninger');
select tt.eq((select count(*) from public.leads l join public.cases c on c.id = l.case_id where c.is_emergency and l.clinic_id = tt.cid('Z'))::int, 0, 'ingen akut-leads efter afvisninger');

-- Succes
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select tt.emg(%L, %L, %L, p_postal => %L)', 'Z', 'akut_konsultation', tt.slot(3, 18), '2100'), 'pA sender akut-lead');

select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pA') and is_emergency and status = 'submitted' and summary_approved_at is not null and summary_text is not null and postal_code = '2100')::int, 1, 'akutsagen er submitted med godkendt opsummering');
select tt.eq((select count(*) from public.case_services cs join public.cases c on c.id = cs.case_id where c.is_emergency and c.patient_id = tt.id('pA') and cs.service_id = tt.svc('akut_konsultation'))::int, 1, 'ydelsen er bekræftet');
select tt.eq((select b.status::text from public.bookings b join public.leads l on l.id = b.lead_id join public.cases c on c.id = l.case_id
               where c.is_emergency and c.patient_id = tt.id('pA')), 'held', 'tiden er reserveret (held)');
select tt.eq((select count(*) from public.bookings b where b.clinic_id = tt.cid('Z') and b.hold_expires_at is not null and b.hold_expires_at > now())::int, 1, 'reservationen har udløbstid');

-- Samme tid til en anden patient: SLOT_TAKEN og ingen halv sag
select tt.as_user(tt.id('pB'));
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'akut_konsultation', tt.slot(3, 18)), 'samme tid giver SLOT_TAKEN', 'SLOT_TAKEN');
select tt.as_postgres();
select tt.eq((select count(*) from public.cases where patient_id = tt.id('pB') and is_emergency)::int, 0, 'pB: ingen halv akutsag efter SLOT_TAKEN');
select tt.eq((select count(*) from public.case_services cs join public.cases c on c.id = cs.case_id where c.is_emergency and c.patient_id = tt.id('pB'))::int, 0, 'pB: ingen ydelse efter SLOT_TAKEN');

-- Klinikken ser akut-leadet uden kontaktfelter, før den accepterer
select tt.as_user(tt.id('uZ'));
select tt.eq((select count(*) from public.clinic_leads() where is_emergency)::int, 1, 'klinik Z ser akut-leadet');
select tt.eq((select contact_name from public.clinic_lead_detail((select lead_id from public.clinic_leads() where is_emergency limit 1))), null, 'ingen kontaktnavn før accept');
-- Klinik X ser det ikke
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_leads() where is_emergency)::int, 0, 'klinik X ser ikke Zs akut-lead');

-- Funktionen er ikke kaldbar for anon
select tt.as_anon();
select tt.denied(format('select tt.emg(%L, %L, %L)', 'Z', 'akut_konsultation', tt.slot(4, 18)), 'anon-rollen kan ikke kalde funktionen');

rollback;

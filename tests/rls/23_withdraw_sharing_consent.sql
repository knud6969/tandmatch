-- Test 23: Tilbagetrækning af health_data_sharing gør patientens sent- og ubookede accepted-leads withdrawn (klinikken
-- mister adgang) og frigiver held; booked består.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'C1');
select tt.mk_case('pA', 'C2');
select tt.mk_case('pB', 'CB');
select tt.mk_case('pA', 'C3');
select tt.mk_lead('C1', 'X', 'sent');
select tt.mk_booking(tt.mk_lead('C1', 'Y', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held');
select tt.mk_booking(tt.mk_lead('C1', 'Z', 'booked'), 'undersoegelse', tt.slot(4, 10), 'booked');
select tt.mk_lead('C2', 'W', 'accepted');
select tt.mk_lead('CB', 'X', 'sent');   -- en anden patients lead må ikke røres

-- Kun ejeren kan trække tilbage
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.withdraw_consent(%L)', tt.consent('pA', 'health_data_sharing')), 'en anden patient kan ikke trække pA''s samtykke tilbage', 'NOT_FOUND');

-- Kontrol: X ser indholdet før tilbagetrækning
select tt.as_user(tt.id('uX'));
select tt.ok((select d.summary_text is not null from public.clinic_lead_detail(tt.lead('C1', 'X')) d), 'før: X ser sagens indhold');
select tt.rows('select 1 from public.clinic_leads() where service_names is not null', 2, 'før: X ser indhold på begge leads');

select tt.as_user(tt.id('pA'));
select tt.eq((select w.withdrawn_leads from public.withdraw_consent(tt.consent('pA', 'health_data_sharing')) w), 3, 'tre leads trukket tilbage (sent, sent med held, accepted)');
select tt.as_postgres();
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'X')), 'withdrawn', 'sent lead er withdrawn');
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'Y')), 'withdrawn', 'sent lead med held er withdrawn');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('C1', 'Y')), 'cancelled', 'held-reservationen er frigivet');
select tt.eq((select status::text from public.leads where id = tt.lead('C2', 'W')), 'withdrawn', 'ubooket accepted lead er withdrawn');
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'Z')), 'booked', 'booked lead består');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('C1', 'Z')), 'booked', 'booked booking består');
select tt.eq((select status::text from public.leads where id = tt.lead('CB', 'X')), 'sent', 'en anden patients lead er urørt');

-- Klinikkerne mister adgangen
select tt.as_user(tt.id('uX'));
select tt.eq((select d.status::text from public.clinic_lead_detail(tt.lead('C1', 'X')) d), 'withdrawn', 'X ser kun, at leadet er withdrawn');
select tt.eq((select d.summary_text from public.clinic_lead_detail(tt.lead('C1', 'X')) d), null::text, 'X mister sagens indhold');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('C1', 'X')))::int, 0, 'X mister billederne');
select tt.ok((select d.summary_text is not null from public.clinic_lead_detail(tt.lead('CB', 'X')) d), 'X beholder den anden patients lead');
select tt.as_user(tt.id('uW'));
select tt.eq((select d.summary_text from public.clinic_lead_detail(tt.lead('C2', 'W')) d), null::text, 'W mister sagens indhold (accepted uden booking)');
select tt.as_user(tt.id('uZ'));
select tt.ok((select d.summary_text is not null from public.clinic_lead_detail(tt.lead('C1', 'Z')) d), 'Z (booket) beholder sagens indhold');

-- Patienten kan selv aflyse den bestående booking
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.cancel_booking(%L)', tt.booking(tt.lead('C1', 'Z'))), 'patienten kan aflyse den bestående booking');

-- Nye leads kræver nyt samtykke
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('C3'), tt.cid('V')), 'nyt lead kræver nyt samtykke', 'CONSENT_REQUIRED');
select tt.allowed(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, false)',
                         tt.id('pA'), 'health_data_sharing', 'health_data_sharing@v1-klinikker'), 'nyt samtykke kan gives');
select tt.allowed(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('C3'), tt.cid('V')), 'nyt lead kan sendes efter nyt samtykke');

rollback;

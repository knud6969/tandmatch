-- Test 6: send_leads afviser anonym bruger, et fjerde aktivt lead, samme klinik to gange, ikke-verificeret klinik,
-- manglende opsummering, ingen bekræftede ydelser og manglende health_data_sharing. Efter afvisning eller tilbagetrækning
-- kan et nyt lead sendes. Det 11. lead på en sag afvises uanset status på de 10 første.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Ekstra sager til afvisningerne
select tt.mk_case('pA', 'S_nosummary', p_approve => false);
select tt.mk_case('pA', 'S_noservices', p_services => array[]::text[]);
select tt.mk_case('pC', 'S_pC');          -- pC har ingen samtykker

-- Anonym bruger
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('SAnon'), tt.cid('X')), 'anonym bruger kan ikke sende leads', 'ACCOUNT_REQUIRED');

-- Manglende opsummering, ydelser, samtykke
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S_nosummary'), tt.cid('X')), 'manglende godkendt opsummering', 'CASE_NOT_READY');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S_noservices'), tt.cid('X')), 'ingen bekræftede ydelser', 'CASE_NOT_READY');
select tt.as_user(tt.id('pC'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S_pC'), tt.cid('X')), 'manglende health_data_sharing', 'CONSENT_REQUIRED');

-- Ikke-verificerede klinikker (registered og imported)
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('R')), 'registered klinik kan ikke modtage leads', 'CLINIC_NOT_AVAILABLE');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('I')), 'importeret klinik kan ikke modtage leads', 'CLINIC_NOT_AVAILABLE');
select tt.denied(format('select public.send_leads(%L, array[%L, %L]::uuid[])', tt.id('S'), tt.cid('X'), tt.cid('R')), 'ét ikke-verificeret i et sæt afviser hele sættet', 'CLINIC_NOT_AVAILABLE');
select tt.rows('select 1 from public.leads', 0, 'afvisningerne efterlod ingen leads');

-- Fire på én gang afvises (loft 3 aktive)
select tt.denied(format('select public.send_leads(%L, array[%L, %L, %L, %L]::uuid[])', tt.id('S'), tt.cid('X'), tt.cid('Y'), tt.cid('Z'), tt.cid('W')),
                 'fire leads på én gang', 'LEAD_LIMIT');
-- Samme klinik to gange i ét kald
select tt.denied(format('select public.send_leads(%L, array[%L, %L]::uuid[])', tt.id('S'), tt.cid('X'), tt.cid('X')), 'samme klinik to gange i ét kald', 'INVALID_CLINICS');

-- Tre er tilladt
select tt.eq(public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y'), tt.cid('Z')])::int, 3, 'tre leads sendt');
-- Samme klinik igen
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('X')), 'samme klinik to gange', 'CLINIC_ALREADY_CONTACTED');
-- Fjerde aktive
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('W')), 'fjerde aktive lead', 'LEAD_LIMIT');

-- Efter afvisning (Y afviser) kan et nyt lead sendes
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'decline', null, null, null, 'no_capacity');
select tt.as_user(tt.id('pA'));
select tt.eq(public.send_leads(tt.id('S'), array[tt.cid('W')])::int, 1, 'nyt lead efter afvisning');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('V')), 'igen fire aktive', 'LEAD_LIMIT');
-- Efter tilbagetrækning (X) kan et nyt lead sendes
select public.withdraw_lead(tt.lead('S', 'X'));
select tt.eq(public.send_leads(tt.id('S'), array[tt.cid('V')])::int, 1, 'nyt lead efter tilbagetrækning');
-- Et afvist/tilbagetrukket lead tæller ikke som aktivt, men klinikken kan ikke kontaktes igen
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('X')), 'tilbagetrukket klinik kan ikke kontaktes igen', 'CLINIC_ALREADY_CONTACTED');

-- 11. lead: sag med 10 ikke-aktive leads
select tt.as_postgres();
select tt.mk_case('pB', 'S_ten');
select tt.mk_lead('S_ten', n, case when i % 2 = 0 then 'declined' else 'withdrawn' end::public.lead_status)
  from unnest(array['X','Y','Z','W','V','A1','A2','A3','A4','A5']) with ordinality as t(n, i);
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S_ten'), tt.cid('A6')), 'det 11. lead afvises', 'LEAD_TOTAL_LIMIT');

rollback;

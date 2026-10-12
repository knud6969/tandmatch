-- Test 27 (security 0.7): En verificeret kliniks ejer sletter sin konto, og en anden opretter sig bagefter med samme
-- CVR (overtagelse uden bevis, [PROTOTYPE]). Den nye, ikke-verificerede ejer kan ikke læse den tidligere ejers
-- beskedtråde med patienter, ikke skrive til patienterne og ikke markere beskeder som læst. Patienten kan stadig
-- læse sin egen tråd. Samme regel gælder en klinik, der ikke (længere) er verificeret.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'T1');
select tt.mk_case('pA', 'T2');
select tt.mk_lead('T1', 'A1', 'sent');
select tt.mk_booking(tt.mk_lead('T2', 'A1', 'booked'), 'undersoegelse', now() - interval '5 days', 'completed');

-- Patienten skriver i begge tråde, mens klinikken er verificeret
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('T1', 'A1'), tt.id('pA'), 'Fiktiv besked om tandpine');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('T2', 'A1'), tt.id('pA'), 'Fiktiv besked efter besøget');

select tt.as_user(tt.id('uA1'));
select tt.rows('select 1 from public.messages', 2, 'den verificerede ejer ser sine tråde');

-- Ejerens konto slettes; en anden opretter sig med samme CVR og overtager klinikken (registered)
select tt.as_postgres();
delete from auth.users where id = tt.id('uA1');
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uTakeover'), 'overtager@test.invalid', false,
   jsonb_build_object('role', 'clinic', 'cvr', (select cvr from tt.clinic_names where name = 'A1'),
                      'clinic_name', 'Overtaget klinik', 'address', 'Testvej 9', 'postal_code', '2100', 'city', 'København Ø'));
select tt.eq((select owner_id from public.clinics where id = tt.cid('A1')), tt.id('uTakeover'), 'forudsætning: klinikken er overtaget');
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'registered', 'forudsætning: den nye ejer er ikke verificeret');

select tt.as_user(tt.id('uTakeover'));
select tt.rows('select 1 from public.messages', 0, 'den nye ejer ser ingen af den tidligere ejers beskeder');
select tt.ok(not public.is_lead_participant(tt.lead('T2', 'A1')), 'den nye ejer er ikke deltager i den gamle tråd');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)',
                        tt.lead('T2', 'A1'), tt.id('uTakeover'), 'Skriv venligst dit CPR-nummer'),
                 'den nye ejer kan ikke skrive til patienten', '42501');
select tt.affects('update public.messages set read_at = now()', 0, 'den nye ejer kan ikke markere beskeder som læst');
select tt.rows('select 1 from public.clinic_leads()', 0, 'clinic_leads() er tom for den nye ejer');

-- Patienten ser stadig sin egen tråd
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.messages', 2, 'patienten ser stadig sine beskeder');

-- En verificeret klinik, der sættes tilbage til registered, mister også adgangen til tråden
select tt.as_postgres();
select tt.mk_case('pB', 'T3');
select tt.mk_lead('T3', 'A2', 'sent');
select tt.as_user(tt.id('pB'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('T3', 'A2'), tt.id('pB'), 'Fiktivt spørgsmål');
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A2'), 'registered');
select tt.as_user(tt.id('uA2'));
select tt.rows(format('select 1 from public.messages where lead_id = %L', tt.lead('T3', 'A2')), 0,
               'en ikke-verificeret klinik ser ikke beskeder');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)',
                        tt.lead('T3', 'A2'), tt.id('uA2'), 'Svar'),
                 'en ikke-verificeret klinik kan ikke skrive', '42501');

rollback;

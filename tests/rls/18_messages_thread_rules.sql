-- Test 18: Beskeder kan sendes af begge parter på et lead med status sent, men ikke på declined eller withdrawn.
-- Efter withdrawn kan klinikken hverken læse sagens indhold, billeder eller beskeder.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y'), tt.cid('Z')]);

-- sent: begge parter kan skrive
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'Patient til X'), 'patient kan skrive på sent lead');
select tt.as_user(tt.id('uX'));
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('uX'), 'X til patient'), 'klinik kan skrive på sent lead');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')))::int, 2, 'klinik læser tråden via clinic_lead_messages');
-- Afsender kan ikke udgive sig for andre
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'Falsk afsender'), 'sender_id skal være en selv');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('uX'), '   '), 'tom besked afvises');

-- declined: ingen nye beskeder, men tråden kan stadig læses
select tt.as_user(tt.id('uY'));
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('uY'), 'Y før afvisning'), 'klinik kan skrive inden afvisning');
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'decline', null, null, null, 'not_offered');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('uY'), 'efter afvisning'), 'klinik kan ikke skrive på declined lead');
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('pA'), 'efter afvisning'), 'patient kan ikke skrive på declined lead');
select tt.rows(format('select 1 from public.messages where lead_id = %L', tt.lead('S', 'Y')), 1, 'patienten kan stadig læse tråden på declined lead');

-- withdrawn
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Z'), tt.id('pA'), 'Før tilbagetrækning'), 'patient kan skrive inden tilbagetrækning');
select public.withdraw_lead(tt.lead('S', 'Z'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Z'), tt.id('pA'), 'Efter tilbagetrækning'), 'patient kan ikke skrive på withdrawn lead');
select tt.rows(format('select 1 from public.messages where lead_id = %L', tt.lead('S', 'Z')), 1, 'patienten kan stadig læse tråden på withdrawn lead');
select tt.as_user(tt.id('uZ'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Z'), tt.id('uZ'), 'Efter tilbagetrækning'), 'klinik kan ikke skrive på withdrawn lead');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'Z')))::int, 0, 'klinikken kan ikke læse beskeder på withdrawn lead');
select tt.rows('select 1 from public.messages', 0, 'klinikken ser ingen beskeder');
-- Sagens indhold og billeder
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('S', 'Z')))::int, 0, 'klinikken kan ikke læse billeder på withdrawn lead');
select tt.eq((select d.status::text from public.clinic_lead_detail(tt.lead('S', 'Z')) d), 'withdrawn', 'clinic_lead_detail() viser status withdrawn');
select tt.eq((select d.summary_text from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::text, 'withdrawn: intet summary_text');
select tt.eq((select d.services from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::jsonb, 'withdrawn: ingen ydelser');
select tt.eq((select d.postal_code from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::text, 'withdrawn: intet område');
select tt.eq((select d.image_count from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::int, 'withdrawn: ingen billedtælling');
select tt.eq((select d.preferred_timeframe::text from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::text, 'withdrawn: intet ønsket tidsrum');
select tt.eq((select d.distance_km from public.clinic_lead_detail(tt.lead('S', 'Z')) d), null::numeric, 'withdrawn: ingen afstand');
select tt.eq((select count(*) from public.clinic_leads(null) l where l.status = 'withdrawn' and (l.service_names is not null or l.postal_code is not null or l.city is not null or l.unread_messages is not null))::int, 0,
             'withdrawn lead i listen har kun id, status og tider');
select tt.eq((select count(*) from public.clinic_leads(null) l where l.status = 'withdrawn')::int, 1, 'withdrawn lead er stadig på klinikkens liste');

-- accepted (kontrol): tråden er åben
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept');
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('uX'), 'Efter accept'), 'klinik kan skrive på accepted lead');

-- Markering som læst: kun modtageren, kun read_at
select tt.as_user(tt.id('pA'));
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_id = %L', tt.lead('S', 'X'), tt.id('uX')), 2, 'modtageren kan markere som læst');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_id = %L', tt.lead('S', 'X'), tt.id('pA')), 0, 'afsenderen kan ikke markere egne som læst');
select tt.denied(format('update public.messages set body = %L where lead_id = %L', 'redigeret', tt.lead('S', 'X')), 'beskeder kan ikke redigeres', '42501');
select tt.denied(format('delete from public.messages where lead_id = %L', tt.lead('S', 'X')), 'beskeder kan ikke slettes', '42501');

rollback;

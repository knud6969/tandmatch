-- Test 28 (security 0.7, H1 og M4): Klinikken har hverken SELECT eller UPDATE på messages, fordi sender_id er patientens
-- id. Tråden læses via clinic_lead_messages() (aldrig sender_id, kun from_me), og læsemarkering sker via
-- clinic_mark_messages_read(). Tidsstempler på messages og ai_messages sættes af databasen.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Patient til X');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Patient til X igen');
select tt.as_user(tt.id('uX'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('uX'), 'X til patient');

-- Ingen direkte adgang til tabellen
select tt.rows('select 1 from public.messages', 0, 'klinikken kan ikke SELECT fra messages');
select tt.rows('select sender_id from public.messages', 0, 'klinikken kan ikke læse sender_id');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L', tt.lead('S', 'X')), 0, 'klinikken kan ikke UPDATE messages');

-- Funktionen
select tt.ok(not tt.fn_returns_column('public.clinic_lead_messages(uuid)'::regprocedure, 'sender_id'), 'clinic_lead_messages returnerer ikke sender_id');
select tt.ok(tt.fn_returns_column('public.clinic_lead_messages(uuid)'::regprocedure, 'from_me'), 'clinic_lead_messages returnerer from_me');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')))::int, 3, 'klinikken ser hele tråden');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where m.from_me)::int, 1, 'præcis én besked er klinikkens egen');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where m::text like '%' || tt.id('pA')::text || '%')::int, 0,
             'patientens id optræder ikke i svaret');

-- En anden klinik får intet og kan ikke markere
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')))::int, 0, 'Y ser ikke X''s tråd');
select public.clinic_mark_messages_read(tt.lead('S', 'X'));
select tt.as_postgres();
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X') and read_at is not null)::int, 0, 'Y kunne ikke markere som læst');

-- Klinikken markerer patientens beskeder som læst (ikke sine egne)
select tt.as_user(tt.id('uX'));
select public.clinic_mark_messages_read(tt.lead('S', 'X'));
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where not m.from_me and m.read_at is not null)::int, 2, 'patientens beskeder er markeret læst');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where m.from_me and m.read_at is not null)::int, 0, 'klinikkens egne er ikke markeret');
select tt.eq((select unread_messages from public.clinic_leads() where lead_id = tt.lead('S', 'X')), 0, 'ulæste i oversigten er 0');

-- Patienten ser stadig sin egen tråd (inkl. sender_id) og kan markere klinikkens besked
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.messages', 3, 'patienten ser sin tråd');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_id = %L', tt.lead('S', 'X'), tt.id('uX')), 1, 'patienten markerer klinikkens besked');

-- Tilbagetrukket lead: ingen tråd
select public.withdraw_lead(tt.lead('S', 'Y'));
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'Y')))::int, 0, 'withdrawn: ingen tråd');

-- M4: tidsstempler sættes af databasen
select tt.as_postgres();
insert into public.messages (lead_id, sender_id, body, created_at, read_at)
values (tt.lead('S', 'X'), tt.id('pA'), 'Bagdateret', '2000-01-01', '2000-01-02');
select tt.eq((select created_at from public.messages where body = 'Bagdateret'), now(), 'messages.created_at tvinges til now()');
select tt.eq((select read_at from public.messages where body = 'Bagdateret'), null::timestamptz, 'messages.read_at tvinges til null');
insert into public.ai_messages (conversation_id, patient_id, role, content, created_at)
values (tt.id('convS'), tt.id('pA'), 'user', 'Bagdateret AI-besked', '2000-01-01');
select tt.eq((select created_at from public.ai_messages where content = 'Bagdateret AI-besked'), now(), 'ai_messages.created_at tvinges til now()');
-- Også når patienten selv forsøger (afvises enten af kolonnerettigheder eller overskrives)
select tt.as_user(tt.id('pA'));
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'Normal'), 'almindelig besked');
select tt.as_postgres();
select tt.ok((select created_at >= now() - interval '1 minute' from public.messages where body = 'Normal'), 'almindelig besked har nutidigt tidsstempel');

rollback;

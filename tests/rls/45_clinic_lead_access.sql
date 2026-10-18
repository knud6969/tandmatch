-- Test 45 (arbejdsplan 5.5a, security H1 og L1, review 5, architecture 5.4, 5.5, 12.3 punkt 46):
--  * H1: en klinik har ingen direkte SELECT på leads (heller ikke egne eller tilbagetrukne leads); patienten ser stadig sine.
--  * clinic_lead_status() giver status for egne leads og null for fremmede, for en ikke-verificeret klinik og for leads fra
--    før owner_since; patienten og anonyme får ingen status.
--  * L1: patienten kan ikke læse messages.sender_id, men de øvrige kolonner; klinikken kan stadig skrive og læse tråden
--    via funktionerne, og patienten kan stadig markere klinikkens beskeder som læst.
--  * Review 5: clinic_leads().image_count tæller ikke billeder, når image_upload-samtykket er trukket tilbage.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y'), tt.cid('Z')]);
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Patient til X');

-- H1: ingen direkte læsning af leads for klinikker
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.leads', 0, 'X kan ikke læse leads direkte (heller ikke sit eget)');
select tt.rows(format('select id from public.leads where id = %L', tt.lead('S', 'X')), 0, 'X kan ikke læse sit eget lead på id');
select tt.rows(format('select case_id from public.leads where clinic_id = %L', tt.cid('X')), 0, 'X kan ikke læse case_id');
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.leads', 0, 'Y kan ikke læse leads direkte');

-- Patienten ser stadig sine tre leads; en anden patient ser ingen
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.leads', 3, 'patienten ser sine egne leads');
select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.leads', 0, 'en anden patient ser ingen af pA''s leads');

-- clinic_lead_status(): egne leads
select tt.as_user(tt.id('uX'));
select tt.eq(public.clinic_lead_status(tt.lead('S', 'X'))::text, 'sent', 'X får status for sit eget lead');
select tt.ok(public.clinic_lead_status(tt.lead('S', 'Y')) is null, 'X får ingen status for Y''s lead');
select tt.ok(public.clinic_lead_status(gen_random_uuid()) is null, 'ukendt lead giver null');
select tt.as_user(tt.id('uY'));
select tt.ok(public.clinic_lead_status(tt.lead('S', 'X')) is null, 'Y får ingen status for X''s lead');
select tt.eq(public.clinic_lead_status(tt.lead('S', 'Y'))::text, 'sent', 'Y får status for sit eget lead');
-- patient og anonym
select tt.as_user(tt.id('pA'));
select tt.ok(public.clinic_lead_status(tt.lead('S', 'X')) is null, 'patienten får ingen status via funktionen');
select tt.as_anon();
select tt.denied(format('select public.clinic_lead_status(%L)', tt.lead('S', 'X')), 'anonyme kan ikke kalde funktionen', '42501');

-- Tilbagetrukket lead: klinikken ser stadig statussen (tråden er lukket), men intet indhold
select tt.as_user(tt.id('pA'));
select public.withdraw_lead(tt.lead('S', 'Z'));
select tt.as_user(tt.id('uZ'));
select tt.eq(public.clinic_lead_status(tt.lead('S', 'Z'))::text, 'withdrawn', 'Z får status withdrawn');
select tt.rows('select 1 from public.leads', 0, 'Z kan ikke læse det tilbagetrukne lead direkte');

-- Ikke-verificeret klinik og lead fra før owner_since
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = (select owner_since from public.clinics where id = tt.cid('Y')) - interval '1 day' where id = tt.lead('S', 'Y');
alter table public.leads enable trigger leads_before_update;
select tt.as_user(tt.id('uY'));
select tt.ok(public.clinic_lead_status(tt.lead('S', 'Y')) is null, 'lead fra før owner_since giver null');
select tt.as_postgres();
select set_config('tm.clinic_status', 'on', true);
update public.clinics set status = 'registered' where id = tt.cid('X');
select set_config('tm.clinic_status', '', true);
select tt.as_user(tt.id('uX'));
select tt.ok(public.clinic_lead_status(tt.lead('S', 'X')) is null, 'en ikke-verificeret klinik får null');
select tt.as_postgres();
select set_config('tm.clinic_status', 'on', true);
update public.clinics set status = 'verified' where id = tt.cid('X');
select set_config('tm.clinic_status', '', true);

-- L1: kolonne-grant på messages
select tt.as_user(tt.id('pA'));
select tt.denied('select sender_id from public.messages', 'patienten kan ikke læse sender_id');
select tt.denied('select * from public.messages', 'select * afvises, fordi sender_id ikke er tilladt');
select tt.allowed('select id, lead_id, sender_role, body, created_at, read_at from public.messages', 'patienten kan læse de øvrige kolonner');
select tt.rows('select id, lead_id, sender_role, body, created_at, read_at from public.messages', 1, 'patienten ser sin tråd');
select tt.as_user(tt.id('uX'));
select tt.denied('select sender_id from public.messages', 'klinikken kan ikke læse sender_id');
select tt.rows('select id from public.messages', 0, 'klinikken har stadig ingen rækker i messages');

-- Policy-udtryk med sender_id virker stadig: indsættelse og markering som læst
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('uX'), 'X til patient'), 'klinikken kan stadig skrive');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'forfalsket afsender'), 'sender_id skal være den indloggede');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')))::int, 2, 'klinikken læser tråden via funktionen');
select tt.as_user(tt.id('pA'));
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_role = %L', tt.lead('S', 'X'), 'clinic'), 1, 'patienten markerer klinikkens besked som læst');
select tt.denied(format('update public.messages set sender_id = %L', tt.id('uY')), 'sender_id kan ikke opdateres', '42501');

-- Review 5: image_count følger samtykket
select tt.as_user(tt.id('uX'));
select tt.eq((select image_count from public.clinic_leads() where lead_id = tt.lead('S', 'X')), 1, 'X ser ét billede med aktivt samtykke');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('S', 'X')))::int, 1, 'clinic_lead_images giver ét billede');
select tt.as_postgres();
update public.consents set withdrawn_at = now() where id = tt.consent('pA', 'image_upload');
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('S', 'X')))::int, 0, 'ingen billeder uden samtykke (funktionen)');
select tt.eq((select image_count from public.clinic_leads() where lead_id = tt.lead('S', 'X')), 0, 'image_count tæller ikke billeder uden samtykke');
select tt.eq((select image_count from public.clinic_lead_detail(tt.lead('S', 'X'))), 0, 'clinic_lead_detail().image_count tæller heller ikke billeder uden samtykke');

rollback;

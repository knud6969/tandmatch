-- Test 46 (arbejdsplan 5.5d, review 2 og security L2, architecture 5.7, 10.9):
--  * clinic_lead_detail().unread_messages tæller patientens ulæste beskeder, falder til 0 efter clinic_mark_messages_read()
--    og er altid 0 for et tilbagetrukket lead; en anden klinik får ingen række.
--  * clinic_leads() sorterer kun på is_emergency for leads, der ikke er trukket tilbage: et tilbagetrukket akut-lead
--    sorteres ikke før et ikke-akut lead (ellers afslører rækkefølgen akut-flaget).
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Tre sager til X: akut (aktivt, ældst), akut (senere tilbagetrukket) og ikke-akut (nyest)
select tt.mk_case('pA', 'EA');
select tt.mk_case('pA', 'EW');
select tt.mk_case('pA', 'N1');
alter table public.cases disable trigger cases_guard;
update public.cases set is_emergency = true where id in (tt.id('EA'), tt.id('EW'));
alter table public.cases enable trigger cases_guard;
select tt.mk_lead('EA', 'X', 'accepted');
select tt.mk_lead('EW', 'X', 'sent');
select tt.mk_lead('N1', 'X', 'accepted');

-- Patienten skriver 2 beskeder på det ikke-akutte lead og 1 på det, der senere trækkes tilbage
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values
  (tt.lead('N1', 'X'), tt.id('pA'), 'Første'), (tt.lead('N1', 'X'), tt.id('pA'), 'Anden'),
  (tt.lead('EW', 'X'), tt.id('pA'), 'Før tilbagetrækning');

select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = now() + interval '1 hour' where id = tt.lead('EA', 'X');
update public.leads set sent_at = now() + interval '2 hours', status = 'withdrawn', withdrawn_at = now() where id = tt.lead('EW', 'X');
update public.leads set sent_at = now() + interval '3 hours' where id = tt.lead('N1', 'X');
alter table public.leads enable trigger leads_before_update;

-- unread_messages
select tt.as_user(tt.id('uX'));
select tt.eq((select unread_messages from public.clinic_lead_detail(tt.lead('N1', 'X'))), 2, 'detail tæller 2 ulæste beskeder');
select tt.eq((select unread_messages from public.clinic_lead_detail(tt.lead('EA', 'X'))), 0, 'detail giver 0 uden beskeder');
select tt.eq((select unread_messages from public.clinic_lead_detail(tt.lead('EW', 'X'))), 0, 'detail giver 0 for et tilbagetrukket lead');
select tt.eq((select unread_messages from public.clinic_leads() where lead_id = tt.lead('N1', 'X')), 2, 'listen og detaljen er enige');
select tt.eq((select count(*) from public.clinic_lead_detail(tt.lead('N1', 'X')))::int, 1, 'detail giver én række');
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_lead_detail(tt.lead('N1', 'X')))::int, 0, 'Y får ingen række for X''s lead');
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.clinic_lead_detail(tt.lead('N1', 'X')))::int, 0, 'patienten får ingen række');
select tt.as_anon();
select tt.denied(format('select * from public.clinic_lead_detail(%L)', tt.lead('N1', 'X')), 'anonyme kan ikke kalde funktionen', '42501');
select tt.as_user(tt.id('uX'));
select public.clinic_mark_messages_read(tt.lead('N1', 'X'));
select tt.eq((select unread_messages from public.clinic_lead_detail(tt.lead('N1', 'X'))), 0, 'detail giver 0 efter markering som læst');

-- Sortering: aktivt akut-lead først, derefter nyeste; det tilbagetrukne akut-lead sorteres som et almindeligt lead
select tt.eq(
  (select array_agg(lead_id order by ord) from (select lead_id, row_number() over () as ord from public.clinic_leads()) t),
  array[tt.lead('EA', 'X'), tt.lead('N1', 'X'), tt.lead('EW', 'X')],
  'akut aktivt lead først, tilbagetrukket akut-lead ikke før det ikke-akutte');
select tt.ok((select is_emergency from public.clinic_leads() where lead_id = tt.lead('EW', 'X')) is null,
  'akut-flaget er stadig skjult for det tilbagetrukne lead');

rollback;

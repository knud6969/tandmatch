-- Test 55 (features/leads/README.md 5.7 og 10.9, migration 20261101000200): clinic_leads() har indbakkens nye kolonner
-- (summary_excerpt, list_price_min/max, hold_expires_at) uden at åbne for mere:
--  * en klinik ser kun egne leads; en anden klinik, patienten og anonyme ser intet
--  * summary_excerpt er højst 121 tegn med samlede mellemrum; listeprisen er snapshottet
--  * hold_expires_at kun for en held-booking (ikke efter accept/booked), og aldrig for et tilbagetrukket lead
--  * ingen kontaktkolonner, intet patient_id eller case_id i returtypen
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'O1');
select tt.mk_case('pA', 'O2');
select tt.mk_case('pB', 'O3');
select tt.as_postgres();
select set_config('tm.system', 'on', true);
update public.cases set summary_text = E'  Ondt   i\n\nkindtanden. ' || repeat('lang tekst ', 30), summary_approved_at = now() where id = tt.id('O1');
select set_config('tm.system', '', true);
select tt.mk_lead('O1', 'X', 'sent');
select tt.mk_lead('O2', 'X', 'sent');
select tt.mk_lead('O3', 'Y', 'sent');
alter table public.leads disable trigger leads_before_update;
update public.leads set list_price_min = 800, list_price_max = 1200 where id = tt.lead('O1', 'X');
alter table public.leads enable trigger leads_before_update;
-- O2 har en reserveret akuttid (held) med frist om 20 minutter
select tt.mk_booking(tt.lead('O2', 'X'), 'akut_konsultation', tt.slot(2, 10), 'held', 30, now() + interval '20 minutes');

-- Returtypen har de nye kolonner og ingen kontakt eller id'er
select tt.ok(tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'summary_excerpt'), 'summary_excerpt findes');
select tt.ok(tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'list_price_min'), 'list_price_min findes');
select tt.ok(tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'hold_expires_at'), 'hold_expires_at findes');
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'contact_name'), 'ingen contact_name');
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'contact_phone'), 'ingen contact_phone');
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'patient_id'), 'intet patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)'::regprocedure, 'case_id'), 'intet case_id');

-- X ser kun sine egne to leads
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_leads())::int, 2, 'X ser sine to leads');
select tt.eq((select count(*) from public.clinic_leads() where lead_id = tt.lead('O3', 'Y'))::int, 0, 'X ser ikke Y''s lead');
select tt.ok((select summary_excerpt from public.clinic_leads() where lead_id = tt.lead('O1', 'X')) like 'Ondt i kindtanden. lang%',
  'uddraget har samlede mellemrum og ingen indledende mellemrum');
select tt.eq((select length(summary_excerpt) from public.clinic_leads() where lead_id = tt.lead('O1', 'X')), 121, 'uddraget er 121 tegn');
select tt.eq((select list_price_min from public.clinic_leads() where lead_id = tt.lead('O1', 'X')), 800, 'listepris min');
select tt.eq((select list_price_max from public.clinic_leads() where lead_id = tt.lead('O1', 'X')), 1200, 'listepris max');
select tt.ok((select hold_expires_at from public.clinic_leads() where lead_id = tt.lead('O1', 'X')) is null, 'ingen frist uden reservation');
select tt.ok((select hold_expires_at from public.clinic_leads() where lead_id = tt.lead('O2', 'X')) > now(), 'frist for held-booking');

-- Y ser kun sit eget lead, og ingen af X's felter
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_leads())::int, 1, 'Y ser kun sit eget lead');
select tt.eq((select count(*) from public.clinic_leads() where lead_id in (tt.lead('O1', 'X'), tt.lead('O2', 'X')))::int, 0, 'Y ser ingen af X''s leads');

-- Patienten og anonyme
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.clinic_leads())::int, 0, 'patienten får ingen rækker');
select tt.as_anon();
select tt.denied('select * from public.clinic_leads()', 'anonyme kan ikke kalde funktionen', '42501');

-- Udløbet reservation: ingen frist (effektiv status er ikke længere held)
select tt.as_postgres();
update public.bookings set hold_expires_at = now() - interval '1 minute' where lead_id = tt.lead('O2', 'X');
select tt.as_user(tt.id('uX'));
select tt.ok((select hold_expires_at from public.clinic_leads() where lead_id = tt.lead('O2', 'X')) is null, 'ingen frist efter udløb');

-- Tilbagetrukket: uddrag, listepris og frist skjules
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set status = 'withdrawn', withdrawn_at = now() where id = tt.lead('O1', 'X');
alter table public.leads enable trigger leads_before_update;
select tt.as_user(tt.id('uX'));
select tt.ok((select summary_excerpt is null and list_price_min is null and list_price_max is null and hold_expires_at is null
                from public.clinic_leads() where lead_id = tt.lead('O1', 'X')), 'tilbagetrukket lead viser intet indhold');

rollback;

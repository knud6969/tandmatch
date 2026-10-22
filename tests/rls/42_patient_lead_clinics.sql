-- Test 42: patient_lead_clinics() returnerer kun klinikker på patientens EGNE leads (10.9). Anon og anden patient ser intet,
-- klinikken har ikke adgang, en 'removed' klinik ses på eget lead (uden logo), og ingen kontaktfelter returneres.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'L1');
select tt.mk_case('pA', 'L2');
select tt.mk_case('pB', 'LB');
select tt.mk_lead('L1', 'X', 'sent');
select tt.mk_lead('L1', 'Y', 'withdrawn');
select tt.mk_lead('LB', 'Z', 'sent');
-- A1 oprettede sig selv og logger et logo; derefter slettes ejerens konto, så klinikken bliver removed
update public.clinics set import_source = null, logo_path = 'clinics/a1/logo.jpg', logo_updated_at = now() where id = tt.cid('A1');
select tt.mk_lead('L2', 'A1', 'sent');
-- tt.cid() slår op på CVR, som nulstilles ved removed: fastfrys id'erne først
create table tt.cids as select n.name, c.id from tt.clinic_names n join public.clinics c on c.cvr = n.cvr;
grant select on tt.cids to public;
create or replace function tt.cid(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from tt.cids where name = p_name
$$;
delete from auth.users where id = tt.id('uA1');
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'removed', 'opsætning: A1 er removed');

-- pA ser X, Y og A1 (removed), men ikke Z (pB's lead)
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.patient_lead_clinics())::int, 3, 'pA ser præcis klinikkerne på egne leads');
select tt.eq((select count(*) from public.patient_lead_clinics(tt.id('L1')))::int, 2, 'indsnævring til én sag');
select tt.eq((select count(*) from public.patient_lead_clinics() where clinic_id = tt.cid('Z'))::int, 0, 'pA ser ikke pB''s klinik');
select tt.eq((select name from public.patient_lead_clinics() where lead_id = tt.lead('L1', 'X')), 'Testklinik X', 'navnet returneres');
select tt.eq((select city from public.patient_lead_clinics() where lead_id = tt.lead('L1', 'X')), 'København Ø', 'byen returneres');
select tt.eq((select removed from public.patient_lead_clinics() where lead_id = tt.lead('L1', 'X')), false, 'X er ikke removed');
select tt.eq((select count(*) from public.patient_lead_clinics() where lead_id = tt.lead('L1', 'Y'))::int, 1, 'tilbagetrukket lead: klinikken ses stadig');
-- Removed klinik ses på eget lead, uden logo
select tt.eq((select removed from public.patient_lead_clinics() where lead_id = tt.lead('L2', 'A1')), true, 'removed klinik ses på eget lead med removed = true');
select tt.eq((select name from public.patient_lead_clinics() where lead_id = tt.lead('L2', 'A1')) is not null, true, 'removed klinik har stadig navn');
select tt.eq((select logo_path from public.patient_lead_clinics() where lead_id = tt.lead('L2', 'A1')) is null, true, 'removed klinik har intet logo');
-- pB ser kun egen klinik
select tt.as_user(tt.id('pB'));
select tt.eq((select count(*) from public.patient_lead_clinics())::int, 1, 'pB ser kun egen klinik');
select tt.eq((select clinic_id from public.patient_lead_clinics()), tt.cid('Z'), 'pB ser Z');
select tt.eq((select count(*) from public.patient_lead_clinics(tt.id('L1')))::int, 0, 'pB kan ikke hente pA''s sag via p_case_id');

-- pC har ingen leads
select tt.as_user(tt.id('pC'));
select tt.eq((select count(*) from public.patient_lead_clinics())::int, 0, 'patient uden leads ser intet');

-- Klinikken (X) er ikke patient: ser intet
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.patient_lead_clinics())::int, 0, 'klinik ser intet via patientfunktionen');

-- Anonym session med egen sag og uden leads
select tt.as_user(tt.id('pAnon'), true);
select tt.eq((select count(*) from public.patient_lead_clinics())::int, 0, 'anonym session ser intet');

-- anon-rollen har ikke EXECUTE
select tt.as_anon();
select tt.denied('select * from public.patient_lead_clinics()', 'anon kan ikke kalde funktionen', '42501');

rollback;

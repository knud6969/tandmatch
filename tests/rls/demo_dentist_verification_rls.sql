-- Tests for demo-admin-stien til verificering af tandlæger (migrationerne 20261008140000 og 20261008150000).
-- Kører sidst. Fixtures bruger egne id'er (f0xx/f1xx), så de ikke kolliderer med tidligere suiter.
-- Fejlkoder er SQLSTATE: 42501 = ikke tilladt, 42883/42501 på EXECUTE afhængigt af rolle (her 42501).

create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_service_role() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  execute 'set role service_role';
end $$;

create function pg_temp.as_db_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

create function pg_temp.expect_error(p_sql text, p_label text, p_state text) returns void
language plpgsql as $$
declare st text;
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  if sqlerrm like 'FEJL:%' then raise; end if;
  if st <> p_state then
    raise exception 'FEJL: % forventede SQLSTATE % men fik % (%)', p_label, p_state, st, sqlerrm;
  end if;
  raise notice 'OK (blokeret, %): % -> %', st, p_label, sqlerrm;
end $$;

create function pg_temp.expect_count(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n is distinct from p_expected then
    raise exception 'FEJL: % forventede %, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (%)', p_label, n;
end $$;

-- ---------- Fixtures (som ejer) ----------
select pg_temp.as_db_owner();

-- D1: tandlæge der søger at verificere sig selv. D2: anden tandlæge med egen klinik.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000f001', 'demo-verif-d1@demo.tandmatch.test',
   '{"role":"dentist","full_name":"Demo Tandlæge 91","authorization_id":"DEMO-9001"}'),
  ('00000000-0000-4000-8000-00000000f002', 'demo-verif-d2@demo.tandmatch.test',
   '{"role":"dentist","full_name":"Demo Tandlæge 92","authorization_id":"DEMO-9002"}');

insert into public.clinics (id, name, address, postal_code, city, created_by) values
  ('00000000-0000-4000-8000-00000000f101', 'Demo Tandklinik Test 91', 'Demogade 91', '2200', 'København N',
   '00000000-0000-4000-8000-00000000f001'),
  ('00000000-0000-4000-8000-00000000f102', 'Demo Tandklinik Test 92', 'Demogade 92', '2100', 'København Ø',
   '00000000-0000-4000-8000-00000000f002');

-- Fiktiv "anden funktion" der sætter tm.system (samme mønster som de eksisterende system-funktioner).
create function pg_temp.fake_system_setter(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('tm.system', 'on', true);
  update public.dentists set is_verified = true where id = p_id;
  perform set_config('tm.system', '', true);
end $$;

-- ---------- (a) Authenticated tandlæge kan ikke sætte is_verified eller klinik direkte ----------
select pg_temp.as_user('00000000-0000-4000-8000-00000000f001');
select pg_temp.expect_error($$update public.dentists set is_verified = true where id = '00000000-0000-4000-8000-00000000f001'$$,
  '(a1) tandlæge kan ikke selv verificere sig', '42501');
select pg_temp.expect_error($$update public.dentists set clinic_id = '00000000-0000-4000-8000-00000000f102' where id = '00000000-0000-4000-8000-00000000f001'$$,
  '(a2) tandlæge kan ikke knytte sig til en klinik oprettet af en anden', '42501');

-- ---------- (b) Authenticated kan ikke kalde demo-funktionen ----------
select pg_temp.expect_error($$select public.demo_set_dentist_verification('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f101', true)$$,
  '(b) authenticated kan ikke kalde demo_set_dentist_verification', '42501');

-- anon må heller ikke
select pg_temp.as_db_owner();
set role anon;
select pg_temp.expect_error($$select public.demo_set_dentist_verification('00000000-0000-4000-8000-00000000f001', null, true)$$,
  '(b2) anon kan ikke kalde demo_set_dentist_verification', '42501');

-- ---------- (c) service_role via RPC kan sætte is_verified og clinic_id ----------
select pg_temp.as_service_role();
select public.demo_set_dentist_verification('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f101', true);
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.dentists where id = '00000000-0000-4000-8000-00000000f001' and is_verified = true and clinic_id = '00000000-0000-4000-8000-00000000f101'$$,
  1, '(c) service_role via RPC sætter is_verified og clinic_id');

-- Efter RPC må tandlægen stadig ikke ændre feltet selv (flaget er lokalt i funktionen).
select pg_temp.as_user('00000000-0000-4000-8000-00000000f001');
select pg_temp.expect_error($$update public.dentists set is_verified = false where id = '00000000-0000-4000-8000-00000000f001'$$,
  '(c2) tandlæge kan ikke fjerne verificeringen efter RPC', '42501');

-- ---------- (d) Anden funktion med tm.system kan IKKE ændre is_verified ----------
select pg_temp.as_service_role();
select pg_temp.expect_error($$select pg_temp.fake_system_setter('00000000-0000-4000-8000-00000000f002')$$,
  '(d) funktion der sætter tm.system kan ikke ændre is_verified', '42501');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.dentists where id = '00000000-0000-4000-8000-00000000f002' and is_verified = false$$,
  1, '(d) D2 er stadig uverificeret efter forsøget');

-- ---------- (e) RPC afviser ugyldig klinik (ikke oprettet af tandlægen) ----------
select pg_temp.as_service_role();
select pg_temp.expect_error($$select public.demo_set_dentist_verification('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f101', true)$$,
  '(e) RPC kan ikke knytte D2 til D1s klinik', '42501');
select pg_temp.as_db_owner();

select 'ALLE DEMO-VERIFICERINGSTESTS PASSEDE' as resultat;

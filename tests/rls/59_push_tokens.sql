-- Test 59: push_tokens og register_push_token() (identity 4.3, migration 20261105000100, RLS-punkt 54).
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Patient A registrerer en enhed.
select tt.as_user(tt.id('pA'));
select public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
select tt.rows('select 1 from public.push_tokens', 1, 'A ser sit eget token');
-- Samme token igen: ingen dublet, last_seen_at opdateres.
select public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
select tt.rows('select 1 from public.push_tokens', 1, 'samme token giver ikke en ny række');
select tt.ok((select last_seen_at from public.push_tokens) > (select created_at from public.push_tokens),
             'last_seen_at er opdateret ved genregistrering');
-- ExpoPushToken[...] er også gyldigt.
select public.register_push_token('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'android');
select tt.rows('select 1 from public.push_tokens', 2, 'A har to enheder');

-- Patient B ser intet af A's tokens og kan hverken ændre eller slette dem.
select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.push_tokens', 0, 'B ser ikke A''s tokens');
select tt.affects('delete from public.push_tokens', 0, 'B kan ikke slette A''s tokens');
select tt.denied('insert into public.push_tokens (user_id, token, platform) values (tt.id(''pB''), ''ExponentPushToken[cccccccccccccccccccccc]'', ''ios'')',
                 'direkte INSERT afvises', '42501');
select tt.denied('update public.push_tokens set platform = ''ios''', 'direkte UPDATE afvises', '42501');

-- Samme token fra B (samme telefon, ny konto): flyttes fra A til B.
select public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
select tt.rows('select 1 from public.push_tokens', 1, 'B ejer nu tokenet');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.push_tokens', 1, 'A har kun sit andet token tilbage');
select tt.eq((select platform from public.push_tokens), 'android', 'A''s resterende token er android');

-- Ugyldigt token eller platform.
select tt.denied('select public.register_push_token(''foo'', ''ios'')', 'ugyldigt token afvises', '22023');
select tt.denied('select public.register_push_token(''ExponentPushToken[ab]'', ''ios'')', 'for kort token afvises', '22023');
select tt.denied('select public.register_push_token(''ExponentPushToken[dddddddddddddddddddddd]'', ''web'')', 'ugyldig platform afvises', '22023');
select tt.denied('select public.register_push_token(null, ''ios'')', 'null afvises', '22023');

-- Højst 5 enheder: den 6. registrering sletter den ældste.
select public.register_push_token('ExponentPushToken[token0000000001]', 'ios');
select public.register_push_token('ExponentPushToken[token0000000002]', 'ios');
select public.register_push_token('ExponentPushToken[token0000000003]', 'ios');
select public.register_push_token('ExponentPushToken[token0000000004]', 'ios');
select tt.rows('select 1 from public.push_tokens', 5, 'fem enheder');
select tt.ok(exists (select 1 from public.push_tokens where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]'), 'det ældste token findes endnu');
select public.register_push_token('ExponentPushToken[token0000000005]', 'ios');
select tt.rows('select 1 from public.push_tokens', 5, 'stadig højst fem');
select tt.ok(not exists (select 1 from public.push_tokens where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]'), 'det ældste token er slettet');
select tt.ok(exists (select 1 from public.push_tokens where token = 'ExponentPushToken[token0000000005]'), 'det nye token findes');

-- Egen sletning virker.
select tt.affects('delete from public.push_tokens where token = ''ExponentPushToken[token0000000005]''', 1, 'A sletter eget token');

-- Anonym, klinik, admin og anon kan ikke registrere.
select tt.as_user(tt.id('pAnon'), true);
select tt.denied('select public.register_push_token(''ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]'', ''ios'')', 'anonym bruger afvises', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied('select public.register_push_token(''ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]'', ''ios'')', 'klinik afvises', '42501');
select tt.rows('select 1 from public.push_tokens', 0, 'klinik ser ingen tokens');
select tt.as_anon();
select tt.denied('select public.register_push_token(''ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]'', ''ios'')', 'anon afvises', '42501');
select tt.denied('select 1 from public.push_tokens', 'anon kan ikke læse', '42501');

-- Admin (profil med rollen admin).
select tt.as_postgres();
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values (tt.id('adm'), 'adm@test.invalid', false, '{"role":"patient"}');
update public.profiles set role = 'admin' where id = tt.id('adm');
select tt.as_user(tt.id('adm'));
select tt.denied('select public.register_push_token(''ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]'', ''ios'')', 'admin afvises', '42501');

-- Sletning af kontoen sletter tokens (cascade).
select tt.as_postgres();
select tt.ok((select count(*) from public.push_tokens where user_id = tt.id('pA')) > 0, 'A har tokens før sletning');
delete from auth.users where id = tt.id('pA');
select tt.eq((select count(*) from public.push_tokens where user_id = tt.id('pA')), 0::bigint, 'tokens slettes med kontoen');

rollback;

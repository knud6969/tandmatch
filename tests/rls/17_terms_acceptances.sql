-- Test 17: terms_acceptances: A kan ikke læse eller ændre B's, ingen kan ændre egne.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.terms_acceptances', 1, 'A ser kun sin egen accept');
select tt.rows(format('select 1 from public.terms_acceptances where user_id = %L', tt.id('pB')), 0, 'A kan ikke læse B''s accept');
select tt.denied(format('update public.terms_acceptances set terms_version = %L where user_id = %L', 'v0', tt.id('pA')), 'A kan ikke ændre egen accept', '42501');
select tt.denied(format('update public.terms_acceptances set accepted_at = now() where user_id = %L', tt.id('pA')), 'A kan ikke ændre egen accept-tid', '42501');
select tt.denied(format('delete from public.terms_acceptances where user_id = %L', tt.id('pA')), 'A kan ikke slette egen accept', '42501');
select tt.denied(format('update public.terms_acceptances set terms_version = %L where user_id = %L', 'v0', tt.id('pB')), 'A kan ikke ændre B''s accept', '42501');
select tt.denied(format('delete from public.terms_acceptances where user_id = %L', tt.id('pB')), 'A kan ikke slette B''s accept', '42501');
select tt.denied(format('insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at) values (%L, %L, %L, now())', tt.id('pB'), 'v2', 'v2'),
                 'A kan ikke acceptere på B''s vegne');
select tt.allowed(format('insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at) values (%L, %L, %L, now())', tt.id('pA'), 'v2', 'v2'),
                  'A kan acceptere ny version for sig selv');
select tt.rows('select 1 from public.terms_acceptances', 2, 'A ser begge sine accepter');

select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.terms_acceptances', 0, 'klinik ser ingen patienters accepter');
select tt.as_anon();
select tt.rows('select 1 from public.terms_acceptances', 0, 'anon ser ingen accepter');
select tt.denied(format('insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at) values (%L, %L, %L, now())', tt.id('pA'), 'v3', 'v3'), 'anon kan ikke acceptere');

rollback;

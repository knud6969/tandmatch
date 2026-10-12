-- Test 15: try_consume_anonymous_ai_call(p_user_id) kaldt med service role returnerer true for en anonym bruger under
-- loftet, false over loftet og false for en permanent bruger.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Lavt loft, så testen er hurtig
update public.ai_limits set value = 3 where key = 'anon_daily_ai_calls';
delete from public.ai_usage_daily;

select tt.as_service();
-- auth.uid() er tom for service role (5.1 regel 8): funktionen må ikke afhænge af den
select tt.eq(auth.uid(), null::uuid, 'service role har ingen auth.uid()');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pAnon')), true, 'kald 1 under loftet');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pAnon')), true, 'kald 2 under loftet');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pAnon')), true, 'kald 3 under loftet (sidste ledige)');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pAnon')), false, 'kald 4 over loftet');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pAnon')), false, 'kald 5 over loftet');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily), 3, 'tælleren stopper ved loftet');

-- Permanent bruger: false og forbruger intet
update public.ai_usage_daily set anonymous_calls = 0;
select tt.as_service();
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('pA')), false, 'permanent bruger giver false');
select tt.eq(public.try_consume_anonymous_ai_call(tt.id('uX')), false, 'klinikbruger giver false');
select tt.eq(public.try_consume_anonymous_ai_call(gen_random_uuid()), false, 'ukendt bruger giver false');
select tt.eq(public.try_consume_anonymous_ai_call(null), false, 'null giver false');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily), 0, 'afviste kald forbruger intet af loftet');

rollback;

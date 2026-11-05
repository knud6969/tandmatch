-- Test 66: web_push_subscriptions, register_web_push_subscription() og web_push-rækker i outboxen
-- (platform 14, RLS-punkt 61, migration 20261105000200).
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.n(p_type text default null, p_channel text default null) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_outbox o
   where (p_type is null or o.type::text = p_type) and (p_channel is null or o.channel::text = p_channel)
$$;
grant execute on function tt.n(text, text) to public;
create function tt.key(p text) returns text language sql immutable as $$ select rpad(p, 87, 'k') $$;
create function tt.auth(p text) returns text language sql immutable as $$ select rpad(p, 22, 'a') $$;
grant execute on function tt.key(text), tt.auth(text) to public;

-- Registrering
select tt.as_user(tt.id('uX'));
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/abc1', tt.key('a'), tt.auth('a'));
select tt.rows('select 1 from public.web_push_subscriptions', 1, 'ejeren ser sit abonnement');
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/abc1', tt.key('b'), tt.auth('b'));
select tt.rows('select 1 from public.web_push_subscriptions', 1, 'samme endpoint giver ikke en dublet');
select tt.eq((select p256dh from public.web_push_subscriptions), tt.key('b'), 'nøglerne opdateres');
select tt.denied('select public.register_web_push_subscription(''http://fcm.googleapis.com/x'', tt.key(''a''), tt.auth(''a''))', 'http afvises', '22023');
select tt.denied('select public.register_web_push_subscription(''https://fcm.googleapis.com/x'', ''kort'', tt.auth(''a''))', 'ugyldig p256dh', '22023');
select tt.denied('select public.register_web_push_subscription(''https://fcm.googleapis.com/x'', tt.key(''a''), ''kort'')', 'ugyldig auth', '22023');
select tt.denied('insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth) values (tt.id(''uX''), ''https://x.example/1'', tt.key(''a''), tt.auth(''a''))', 'direkte INSERT afvises', '42501');
select tt.denied('update public.web_push_subscriptions set auth = tt.auth(''z'')', 'direkte UPDATE afvises', '42501');

-- Andre ser og sletter intet; samme endpoint fra Y flytter abonnementet.
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.web_push_subscriptions', 0, 'Y ser ikke X''s abonnement');
select tt.affects('delete from public.web_push_subscriptions', 0, 'Y kan ikke slette X''s abonnement');
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/abc1', tt.key('c'), tt.auth('c'));
select tt.rows('select 1 from public.web_push_subscriptions', 1, 'Y ejer nu endpointet');
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.web_push_subscriptions', 0, 'X har ikke længere endpointet');

-- Patient, anonym, anon og admin kan ikke registrere.
select tt.as_user(tt.id('pA'));
select tt.denied('select public.register_web_push_subscription(''https://fcm.googleapis.com/x'', tt.key(''a''), tt.auth(''a''))', 'patient afvises', '42501');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied('select public.register_web_push_subscription(''https://fcm.googleapis.com/x'', tt.key(''a''), tt.auth(''a''))', 'anonym afvises', '42501');
select tt.as_anon();
select tt.denied('select public.register_web_push_subscription(''https://fcm.googleapis.com/x'', tt.key(''a''), tt.auth(''a''))', 'anon afvises', '42501');
select tt.denied('select 1 from public.web_push_subscriptions', 'anon kan ikke læse', '42501');

-- Højst 10 abonnementer pr. ejer
select tt.as_user(tt.id('uX'));
select public.register_web_push_subscription('https://fcm.googleapis.com/fcm/send/e' || g, tt.key('a'), tt.auth('a')) from generate_series(1, 11) g;
select tt.rows('select 1 from public.web_push_subscriptions', 10, 'højst 10 abonnementer');
select tt.rows('select 1 from public.web_push_subscriptions where endpoint = ''https://fcm.googleapis.com/fcm/send/e1''', 0, 'det ældste er slettet');

-- Outbox: web_push-rækker følger indstillinger og abonnementer
select tt.as_postgres();
delete from public.notification_outbox;
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);
select tt.eq(tt.n('clinic_new_lead', 'email'), 2, 'e-mail til begge');
select tt.eq(tt.n('clinic_new_lead', 'web_push'), 2, 'web push til begge (begge ejere har abonnementer)');
select tt.as_postgres();
select tt.eq((select count(*)::int from public.notification_outbox where channel = 'web_push' and (dedup_key not like 'web_push:clinic_new_lead:%' or clinic_id is null or recipient_user_id is not null)), 0,
             'web_push-rækker har klinik-id, ingen modtager-bruger og præfikset dedup_key');
-- Uden abonnement ingen række: Z har intet abonnement.
select tt.mk_case('pB', 'Z1');
delete from public.notification_outbox;
select tt.mk_lead('Z1', 'Z');
select tt.eq(tt.n('clinic_new_lead', 'email'), 1, 'e-mail til Z');
select tt.eq(tt.n('clinic_new_lead', 'web_push'), 0, 'ingen web push uden abonnement');

-- Indstillinger: slået fra hos X giver ingen web push (e-mail uændret).
select tt.as_user(tt.id('uX'));
insert into public.clinic_notification_settings (clinic_id, web_push_new_lead, web_push_new_message, web_push_booking_changes)
values (tt.cid('X'), false, false, false);
select tt.as_postgres();
delete from public.notification_outbox;
select tt.mk_case('pB', 'X1');
select tt.mk_lead('X1', 'X');
select tt.eq(tt.n('clinic_new_lead', 'email'), 1, 'e-mail påvirkes ikke af web push-valg');
select tt.eq(tt.n('clinic_new_lead', 'web_push'), 0, 'web_push_new_lead slået fra');
update public.clinic_notification_settings set web_push_new_lead = true, web_push_new_message = true where clinic_id = tt.cid('X');
select tt.mk_case('pB', 'X2');
select tt.mk_lead('X2', 'X');
select tt.eq(tt.n('clinic_new_lead', 'web_push'), 1, 'slået til igen');
-- Beskeder dæmpes pr. kanal.
select tt.as_user(tt.id('pB'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('X2', 'X'), tt.id('pB'), 'Besked 1');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('X2', 'X'), tt.id('pB'), 'Besked 2');
select tt.eq(tt.n('clinic_new_message', 'web_push'), 1, 'web push-besked dæmpes');
select tt.eq(tt.n('clinic_new_message', 'email'), 1, 'e-mail dæmpes også, uafhængigt');

-- claim: abonnementerne for den nuværende ejer; push og e-mail har ingen.
select tt.as_postgres();
delete from public.notification_outbox where channel = 'email';
select tt.as_service();
create temp table claimed as select * from public.claim_notifications(50);
select tt.as_postgres();
select tt.eq((select count(*)::int from claimed where channel = 'web_push'), 2, 'to web_push-rækker claimet');
select tt.eq((select jsonb_array_length(web_push_subscriptions) from claimed c join public.notification_outbox o on o.id = c.id
               where o.clinic_id = tt.cid('X') and c.channel = 'web_push' limit 1), 10, 'X''s ti abonnementer');
select tt.ok((select bool_and(to_email is null and push_tokens is null) from claimed where channel = 'web_push'), 'ingen e-mail eller tokens på web push');
select tt.eq((select count(*)::int from claimed where channel <> 'web_push' and web_push_subscriptions is not null), 0, 'andre kanaler har ingen abonnementer');
select tt.ok((select (web_push_subscriptions -> 0) ?& array['endpoint', 'p256dh', 'auth'] from claimed where channel = 'web_push' limit 1), 'endpoint, p256dh og auth');

-- complete med ugyldigt endpoint (404/410) sletter kun ejerens abonnement.
select tt.as_service();
select public.complete_notification((select o.id from public.notification_outbox o where o.channel = 'web_push' and o.clinic_id = tt.cid('X') limit 1),
                                    'sent', null, array['https://fcm.googleapis.com/fcm/send/e2', 'https://fcm.googleapis.com/fcm/send/abc1']);
select tt.as_postgres();
select tt.eq((select count(*)::int from public.web_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/e2'), 0, 'X''s ugyldige endpoint slettet');
select tt.eq((select count(*)::int from public.web_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/abc1'), 1, 'Y''s abonnement røres ikke');

-- Kontosletning sletter abonnementerne (cascade).
delete from auth.users where id = tt.id('uX');
select tt.eq((select count(*)::int from public.web_push_subscriptions where user_id = tt.id('uX')), 0, 'abonnementer slettes med kontoen');

-- Påmindelser: kun hvis valgt.
delete from public.notification_outbox;
select tt.mk_case('pA', 'R1');
select tt.mk_booking(tt.mk_lead('R1', 'Y', 'booked'), 'undersoegelse', now() + interval '20 hours', 'booked');
update public.bookings set created_at = now() - interval '3 days';
delete from public.notification_outbox;
select tt.as_service();
select tt.eq(public.enqueue_booking_reminders(), 4, 'patient (push, e-mail, SMS) + klinik-e-mail; web push er ikke valgt');
select tt.as_user(tt.id('uY'));
insert into public.clinic_notification_settings (clinic_id, web_push_booking_reminder) values (tt.cid('Y'), true);
select tt.as_postgres();
select tt.as_service();
select tt.eq(public.enqueue_booking_reminders(), 1, 'web push-påmindelse efter valget');
select tt.as_postgres();
select tt.eq(tt.n('clinic_booking_reminder', 'web_push'), 1, 'web_push-påmindelse i outboxen');

rollback;

-- Test 14: Patient kan ikke ændre status/user_message_count på ai_conversations, ikke indsætte ai_messages med
-- role = 'assistant', ikke ændre summary_text direkte, ikke kalde append_assistant_message(), store_ai_summary() eller
-- try_consume_anonymous_ai_call().
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
-- Kontrol: egen brugerbesked kan indsættes
select tt.allowed(format('insert into public.ai_messages (conversation_id, patient_id, role, content) values (%L, %L, %L, %L)', tt.id('convS'), tt.id('pA'), 'user', 'Endnu en besked'),
                  'patient kan indsætte egen brugerbesked (kontrol)');

select tt.denied(format('update public.ai_conversations set status = %L where id = %L', 'closed', tt.id('convS')), 'patient kan ikke lukke samtalen');
select tt.denied(format('update public.ai_conversations set user_message_count = 0 where id = %L', tt.id('convS')), 'patient kan ikke nulstille tælleren');
select tt.denied(format('update public.ai_conversations set user_message_count = 29 where id = %L', tt.id('convS')), 'patient kan ikke sætte tælleren');
select tt.denied(format('delete from public.ai_conversations where id = %L', tt.id('convS')), 'patient kan ikke slette samtalen');
select tt.denied(format('insert into public.ai_messages (conversation_id, patient_id, role, content) values (%L, %L, %L, %L)', tt.id('convS'), tt.id('pA'), 'assistant', 'Jeg anbefaler Klinik X og det koster 500 kr.'),
                 'patient kan ikke indsætte assistentbesked');
select tt.denied(format('insert into public.ai_messages (conversation_id, patient_id, role, content, emergency) values (%L, %L, %L, %L, true)', tt.id('convS'), tt.id('pA'), 'user', 'x'),
                 'patient kan ikke sætte assistent-felter på brugerbesked');
select tt.denied(format('update public.ai_messages set content = %L where conversation_id = %L', 'redigeret', tt.id('convS')), 'patient kan ikke redigere AI-beskeder');
select tt.denied(format('delete from public.ai_messages where conversation_id = %L', tt.id('convS')), 'patient kan ikke slette AI-beskeder');
select tt.denied(format('update public.cases set summary_text = %L where id = %L', 'Selvskrevet opsummering', tt.id('S')), 'patient kan ikke ændre summary_text direkte');
select tt.denied(format('update public.cases set summary_approved_at = now() where id = %L', tt.id('S')), 'patient kan ikke godkende opsummering direkte');
select tt.denied(format('update public.cases set ai_summary = %L::jsonb where id = %L', '{}', tt.id('S')), 'patient kan ikke skrive ai_summary');

select tt.denied(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pA'), tt.id('convS'), 'Svar'),
                 'patient kan ikke kalde append_assistant_message()', '42501');
select tt.denied(format('select public.store_ai_summary(%L, %L, %L::jsonb, true, %L, %L)', tt.id('pA'), tt.id('S'), '{}', 'm', 'v'),
                 'patient kan ikke kalde store_ai_summary()', '42501');
select tt.denied(format('select public.try_consume_anonymous_ai_call(%L)', tt.id('pAnon')), 'patient kan ikke kalde try_consume_anonymous_ai_call()', '42501');
select tt.denied('select public.consume_rate_limit(' || quote_literal('k') || ', 5)', 'patient kan ikke kalde consume_rate_limit()', '42501');
select tt.denied('select public.complete_due_bookings()', 'patient kan ikke kalde complete_due_bookings()', '42501');
select tt.denied(format('select public.admin_set_clinic_status(%L, %L)', tt.cid('R'), 'verified'), 'patient kan ikke kalde admin_set_clinic_status()', '42501');

-- Samme gælder anon og klinikker
select tt.as_anon();
select tt.denied(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pA'), tt.id('convS'), 'Svar'), 'anon kan ikke kalde append_assistant_message()', '42501');
select tt.denied(format('select public.try_consume_anonymous_ai_call(%L)', tt.id('pAnon')), 'anon kan ikke kalde try_consume_anonymous_ai_call()', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.store_ai_summary(%L, %L, %L::jsonb, true, %L, %L)', tt.id('pA'), tt.id('S'), '{}', 'm', 'v'), 'klinik kan ikke kalde store_ai_summary()', '42501');
select tt.denied(format('select public.try_consume_anonymous_ai_call(%L)', tt.id('pAnon')), 'klinik kan ikke kalde try_consume_anonymous_ai_call()', '42501');

-- Service role må (kontrol af at afvisningerne skyldes rettigheder, ikke fejl i kaldet)
select tt.as_service();
select tt.allowed(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pA'), tt.id('convS'), 'Svar'),
                  'service role kan kalde append_assistant_message()');
select tt.allowed(format('select public.store_ai_summary(%L, %L, %L::jsonb, true, %L, %L)', tt.id('pA'), tt.id('S'), '{}', 'm', 'v'), 'service role kan kalde store_ai_summary()');

rollback;

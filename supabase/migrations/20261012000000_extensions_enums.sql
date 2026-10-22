-- Samlet migrationssæt, del 1: udvidelser, standardrettigheder og enums (architecture 2.3.1, 4.2, 5.1).

create extension if not exists btree_gist with schema extensions;

-- Standardrettigheder: nye funktioner kan ikke udføres af PUBLIC/anon/authenticated, og anon får ingen
-- tabelrettigheder, før en migration udtrykkeligt giver dem. Hver funktion får desuden egne revoke/grant
-- (belt and braces). RLS er stadig den egentlige adgangskontrol.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;

create type public.user_role as enum ('patient', 'clinic', 'admin');
create type public.clinic_status as enum ('imported', 'registered', 'verified');
create type public.service_category as enum ('cosmetic', 'general', 'emergency');
create type public.case_status as enum ('draft', 'submitted', 'closed');
create type public.case_timeframe as enum ('asap', 'within_2_weeks', 'within_3_months', 'flexible');
create type public.lead_status as enum ('sent', 'accepted', 'declined', 'booked', 'withdrawn');
create type public.lead_decline_reason as enum ('no_capacity', 'not_offered', 'needs_referral', 'other', 'clinic_left');
create type public.booking_status as enum ('held', 'booked', 'completed', 'no_show', 'cancelled');
create type public.booking_actor as enum ('patient', 'clinic');
create type public.consent_type as enum ('health_data_sharing', 'image_upload', 'ai_processing');
create type public.conversation_status as enum ('active', 'closed');
create type public.ai_message_role as enum ('user', 'assistant');
create type public.out_of_scope_topic as enum ('price', 'clinic_recommendation');
create type public.image_view as enum ('front', 'upper', 'lower', 'side_left', 'side_right', 'unclear');
create type public.image_quality as enum ('ok', 'too_dark', 'blurry', 'wrong_angle', 'not_teeth');
create type public.price_accuracy as enum ('as_quoted', 'slightly_higher', 'much_higher');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');

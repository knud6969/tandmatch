-- Patientens e-mail og SMS om bookinger (platform 14.12, besluttet 2026-11-05). Del 1: nye enum-værdier.
-- Står i en egen migration, fordi en ny enum-værdi ikke kan bruges i den transaktion, den oprettes i. Brugen står i
-- 20261108000300_patient_booking_notifications.sql.
--  * notification_channel: 'sms'.
--  * notification_type: patientens egne handlinger (booket, flyttet, aflyst af patienten selv). De giver ingen app-push,
--    kun e-mail, SMS og klokken.

alter type public.notification_channel add value if not exists 'sms';
alter type public.notification_type add value if not exists 'patient_booking_created';
alter type public.notification_type add value if not exists 'patient_booking_rescheduled';
alter type public.notification_type add value if not exists 'patient_booking_cancelled_self';
alter type public.notification_type add value if not exists 'patient_review_reminder';

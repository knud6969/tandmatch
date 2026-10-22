-- 1.9.1b del 1: ny klinikstatus 'removed' (architecture 4.2). Egen fil, fordi en ny enum-værdi ikke må bruges i samme
-- transaktion, som den tilføjes i.
alter type public.clinic_status add value if not exists 'removed';

-- 1.9.8: RLS-policyen på services skjuler også behandlinger i en inaktiv kategori (architecture 5.4). Før skjulte kun
-- API'et dem; nu gælder det i databasen for anon og authenticated. Admin ser fortsat alt (services_select_admin).
drop policy services_select_active on public.services;
create policy services_select_active on public.services
  for select to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.service_groups g where g.id = services.group_id and g.is_active)
  );

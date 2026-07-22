begin transaction read only;

set local statement_timeout = '30s';

-- DIGIY MON COMMERCE PRO — DIAGNOSTIC COMPACT V1 — LECTURE SEULE
-- Aucun téléphone, PIN, nom, slug ou profil d'abonné.
-- Aucune création, modification ou suppression.
-- Une seule ligne finale contient le diagnostic utile.

with
functions as (
  select jsonb_agg(
    jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile
    )
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  ) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ilike '%pos%'
      or p.proname ilike '%commerce%'
      or p.proname ilike '%shop%'
      or p.proname ilike '%gallery%'
      or p.proname in (
        'digiy_verify_pin',
        'digiy_has_access',
        'digiy_has_module_access_from_abos'
      )
    )
),
relations as (
  select jsonb_agg(
    jsonb_build_object(
      'name', c.relname,
      'type', case c.relkind
        when 'r' then 'table'
        when 'p' then 'partitioned_table'
        when 'v' then 'view'
        when 'm' then 'materialized_view'
        else c.relkind::text
      end,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    )
    order by c.relname
  ) as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p','v','m')
    and (
      c.relname ilike '%pos%'
      or c.relname ilike '%commerce%'
      or c.relname ilike '%shop%'
      or c.relname ilike '%gallery%'
    )
),
columns_data as (
  select jsonb_agg(
    jsonb_build_object(
      'table', table_name,
      'position', ordinal_position,
      'column', column_name,
      'type', data_type,
      'udt', udt_name,
      'nullable', is_nullable,
      'default', column_default
    )
    order by table_name, ordinal_position
  ) as value
  from information_schema.columns
  where table_schema = 'public'
    and (
      table_name ilike '%pos%'
      or table_name ilike '%commerce%'
      or table_name ilike '%shop%'
      or table_name ilike '%gallery%'
    )
),
policies_data as (
  select jsonb_agg(
    jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    )
    order by tablename, policyname
  ) as value
  from pg_policies
  where schemaname = 'public'
    and (
      tablename ilike '%pos%'
      or tablename ilike '%commerce%'
      or tablename ilike '%shop%'
      or tablename ilike '%gallery%'
    )
),
grants_data as (
  select jsonb_agg(
    jsonb_build_object(
      'grantee', grantee,
      'table', table_name,
      'privilege', privilege_type
    )
    order by table_name, grantee, privilege_type
  ) as value
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated','public')
    and (
      table_name ilike '%pos%'
      or table_name ilike '%commerce%'
      or table_name ilike '%shop%'
      or table_name ilike '%gallery%'
    )
),
summary as (
  select jsonb_build_object(
    'verify_pin', to_regprocedure('public.digiy_verify_pin(text,text,text)') is not null,
    'has_access', to_regprocedure('public.digiy_has_access(text,text)') is not null,
    'abos_access', to_regprocedure('public.digiy_has_module_access_from_abos(text,text)') is not null,
    'pos_verify_pin_found', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='digiy_pos_verify_pin'
    ),
    'public_gallery_found', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='digiy_pos_public_gallery'
    ),
    'profiles_table', to_regclass('public.digiy_pos_public_profiles') is not null,
    'profile_save_rpc_found', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and (
          p.proname ilike '%pos%'
          or p.proname ilike '%commerce%'
          or p.proname ilike '%shop%'
        )
        and (
          p.proname ilike '%save%'
          or p.proname ilike '%upsert%'
          or p.proname ilike '%publish%'
          or p.proname ilike '%profile%'
        )
    ),
    'profiles_rls_enabled', coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname='digiy_pos_public_profiles'
        and c.relkind in ('r','p')
      limit 1
    ), false),
    'anon_direct_insert_or_update_policy', exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='digiy_pos_public_profiles'
        and cmd in ('ALL','INSERT','UPDATE')
        and (
          'anon'=any(roles)
          or 'public'=any(roles)
        )
    )
  ) as value
)
select
  '10_DIAGNOSTIC_COMPACT' as section,
  summary.value as resume,
  coalesce(functions.value, '[]'::jsonb) as fonctions,
  coalesce(relations.value, '[]'::jsonb) as relations,
  coalesce(columns_data.value, '[]'::jsonb) as colonnes,
  coalesce(policies_data.value, '[]'::jsonb) as politiques_rls,
  coalesce(grants_data.value, '[]'::jsonb) as droits
from summary, functions, relations, columns_data, policies_data, grants_data;

rollback;

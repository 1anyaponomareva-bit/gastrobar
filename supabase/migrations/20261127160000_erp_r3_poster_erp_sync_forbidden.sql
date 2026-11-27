-- Permanent Poster POS ↔ ERP sync ban (owner).
-- Historical poster-sourced rows remain readable; new Poster sync/import blocked.
-- Restore exception: SET LOCAL erp.allow_poster_historical_write = 'on';

create or replace function public.erp_is_poster_erp_source(p_source text)
returns boolean
language sql
immutable
as $$
  select case
    when p_source is null or btrim(p_source) = '' then false
    else (
      lower(btrim(p_source)) in (
        'poster',
        'poster_pos',
        'poster-pos',
        'posterpos',
        'joinposter',
        'poster_api',
        'poster-api',
        'poster.api',
        'poster_sync',
        'poster-sync'
      )
      or lower(btrim(p_source)) like 'poster[_-]%'
      or lower(btrim(p_source)) like 'poster.%'
    )
  end;
$$;

comment on function public.erp_is_poster_erp_source(text) is
  'True for Poster POS source identifiers (exact and common aliases).';

create or replace function public.erp_assert_poster_erp_sync_forbidden(p_source text)
returns void
language plpgsql
as $$
begin
  -- Optional restore/migration escape hatch (session-local only)
  if current_setting('erp.allow_poster_historical_write', true) = 'on' then
    return;
  end if;
  if public.erp_is_poster_erp_source(p_source) then
    perform public.erp_raise(
      'ERP_POSTER_SYNC_FORBIDDEN',
      'Poster POS sync is permanently forbidden by owner. GASTROFOOD ERP runs independently of Poster.'
    );
  end if;
end;
$$;

comment on function public.erp_assert_poster_erp_sync_forbidden(text) is
  'Owner permanent ban: block Poster→ERP sync/import. Historical SELECT unaffected.';

-- Table-level protection (RPC + direct SQL)
create or replace function public.erp_poster_erp_sync_protect_row()
returns trigger
language plpgsql
as $$
declare
  v_allow text := current_setting('erp.allow_poster_historical_write', true);
begin
  if v_allow = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'erp_sales_documents' then
    if tg_op = 'INSERT' then
      perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
      if new.poster_payload is not null then
        perform public.erp_raise(
          'ERP_POSTER_SYNC_FORBIDDEN',
          'poster_payload_write_forbidden'
        );
      end if;
    elsif tg_op = 'UPDATE' then
      -- Changing into a Poster source is forbidden
      if public.erp_is_poster_erp_source(new.source_system)
         and not public.erp_is_poster_erp_source(old.source_system) then
        perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
      end if;
      -- Attaching a new poster_payload to a non-poster (or empty) row is sync
      if new.poster_payload is not null
         and old.poster_payload is null
         and not public.erp_is_poster_erp_source(old.source_system) then
        perform public.erp_raise(
          'ERP_POSTER_SYNC_FORBIDDEN',
          'poster_payload_write_forbidden'
        );
      end if;
      -- Existing historical Poster rows may keep/update non-sync fields
    end if;
  elsif tg_table_name = 'erp_sales_source_links' then
    if tg_op = 'INSERT' then
      perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
    elsif tg_op = 'UPDATE' then
      if public.erp_is_poster_erp_source(new.source_system)
         and not public.erp_is_poster_erp_source(old.source_system) then
        perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
      end if;
      if public.erp_is_poster_erp_source(new.source_system)
         and public.erp_is_poster_erp_source(old.source_system) then
        -- Forbid new Poster link identity changes that look like re-sync
        if new.external_id is distinct from old.external_id
           or new.account_or_location_key is distinct from old.account_or_location_key then
          perform public.erp_raise(
            'ERP_POSTER_SYNC_FORBIDDEN',
            'poster_source_link_resync_forbidden'
          );
        end if;
      end if;
    end if;
  elsif tg_table_name = 'erp_sales_import_batches' then
    if tg_op = 'INSERT' then
      perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
    elsif tg_op = 'UPDATE' then
      if public.erp_is_poster_erp_source(new.source_system)
         and not public.erp_is_poster_erp_source(old.source_system) then
        perform public.erp_assert_poster_erp_sync_forbidden(new.source_system);
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'erp_sales_documents',
    'erp_sales_source_links',
    'erp_sales_import_batches'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists erp_poster_sync_forbid_ins on public.%I', t);
    execute format('drop trigger if exists erp_poster_sync_forbid_upd on public.%I', t);
    execute format(
      'create trigger erp_poster_sync_forbid_ins before insert on public.%I for each row execute function public.erp_poster_erp_sync_protect_row()',
      t
    );
    execute format(
      'create trigger erp_poster_sync_forbid_upd before update on public.%I for each row execute function public.erp_poster_erp_sync_protect_row()',
      t
    );
  end loop;
end $$;

-- Explicit RPC assertions (clear errors before DML)
create or replace function public.erp_sales_link_source(
  p_sales_id uuid,
  p_source text,
  p_external_id text,
  p_account_key text,
  p_match_kind text,
  p_payload jsonb,
  p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_key text := coalesce(nullif(btrim(coalesce(p_account_key, '')), ''), '_');
  v_match text := coalesce(nullif(p_match_kind, ''), 'manual');
  v_existing uuid;
  v_id uuid;
begin
  perform public.erp_assert_poster_erp_sync_forbidden(p_source);
  if p_source not in ('poster', 'grab', 'manual', 'import') then
    perform public.erp_raise('ERP_INVALID', 'source_system');
  end if;
  if v_match not in ('exact', 'manual', 'unmatched', 'conflict') then
    perform public.erp_raise('ERP_INVALID', 'match_kind');
  end if;
  if not exists (select 1 from public.erp_sales_documents where id = p_sales_id and deleted_at is null) then
    perform public.erp_raise('ERP_NOT_FOUND', 'sales_document');
  end if;

  select sales_document_id into v_existing
  from public.erp_sales_source_links
  where source_system = p_source and account_or_location_key = v_key and external_id = btrim(p_external_id);

  if v_existing is not null and v_existing <> p_sales_id then
    if v_match <> 'conflict' and v_match <> 'manual' then
      perform public.erp_raise('ERP_DUPLICATE', 'ambiguous_or_existing_link');
    end if;
    update public.erp_sales_source_links set match_kind = 'conflict', raw_payload = coalesce(p_payload, raw_payload)
    where source_system = p_source and account_or_location_key = v_key and external_id = btrim(p_external_id);
    update public.erp_sales_documents set reconciliation_status = 'conflict', updated_at = now(), updated_by = v_actor
    where id in (v_existing, p_sales_id);
    return v_existing;
  end if;

  insert into public.erp_sales_source_links (
    sales_document_id, source_system, external_id, account_or_location_key, match_kind, raw_payload, created_by
  ) values (
    p_sales_id, p_source, btrim(p_external_id), v_key, v_match, p_payload, v_actor
  )
  on conflict (source_system, account_or_location_key, external_id) do update
    set match_kind = excluded.match_kind,
        raw_payload = coalesce(excluded.raw_payload, erp_sales_source_links.raw_payload)
  returning id into v_id;

  update public.erp_sales_documents set
    reconciliation_status = case v_match
      when 'exact' then 'exact_match'
      when 'manual' then 'manual_match'
      when 'conflict' then 'conflict'
      else 'unmatched' end,
    updated_at = now(),
    updated_by = v_actor
  where id = p_sales_id;

  return v_id;
end;
$$;

create or replace function public.erp_sales_import_stub_validate(
  p_source text,
  p_rows jsonb,
  p_actor text,
  p_file_name text default null
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid;
  v_n int := coalesce(jsonb_array_length(p_rows), 0);
begin
  perform public.erp_assert_poster_erp_sync_forbidden(p_source);
  if p_source not in ('poster', 'grab', 'import') then
    perform public.erp_raise('ERP_INVALID', 'source_system');
  end if;
  insert into public.erp_sales_import_batches (source_system, status, file_name, row_count, notes, created_by)
  values (
    p_source, 'validated', p_file_name, v_n,
    'Phase 9B stub: validated only — no historical apply without owner OK',
    v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Inject explicit assert into erp_save_sales_document (new docs / poster_payload) without rewriting full body.
do $$
declare
  def text;
  newdef text;
  marker text := 'erp_assert_poster_erp_sync_forbidden(v_source)';
  needle text := 'if v_source not in (''manual'', ''poster'', ''grab'', ''import'') then';
  inject text :=
    $i$
  -- Poster POS sync ban (owner): block new Poster-sourced docs and poster_payload writes
  if v_id is null then
    perform public.erp_assert_poster_erp_sync_forbidden(v_source);
    if p ? 'poster_payload' and p->'poster_payload' is not null and jsonb_typeof(p->'poster_payload') <> 'null' then
      perform public.erp_raise('ERP_POSTER_SYNC_FORBIDDEN', 'poster_payload_write_forbidden');
    end if;
  elsif public.erp_is_poster_erp_source(v_source)
        and not exists (
          select 1 from public.erp_sales_documents d
          where d.id = v_id and public.erp_is_poster_erp_source(d.source_system)
        ) then
    perform public.erp_assert_poster_erp_sync_forbidden(v_source);
  end if;
  if v_source not in ('manual', 'poster', 'grab', 'import') then
$i$;
begin
  def := pg_get_functiondef('public.erp_save_sales_document(jsonb,text)'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'erp_save_sales_document already patched';
    return;
  end if;
  if position(needle in def) = 0 then
    raise exception 'erp_save_sales_document: patch needle not found';
  end if;
  newdef := replace(def, needle, inject);
  if newdef = def then
    raise exception 'erp_save_sales_document: patch produced no change';
  end if;
  execute newdef;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'erp_is_poster_erp_source',
        'erp_assert_poster_erp_sync_forbidden',
        'erp_poster_erp_sync_protect_row',
        'erp_sales_link_source',
        'erp_sales_import_stub_validate',
        'erp_save_sales_document'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

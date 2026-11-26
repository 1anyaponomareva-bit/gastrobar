-- Phase 9F-A/B RPCs: BOM explosion + Actual COGS via existing FIFO erp_consume.

-- Classify product into food / packaging / other
create or replace function public.erp_sales_cogs_kind(p_product uuid)
returns text
language sql
stable
as $$
  select case
    when p.type = 'packaging' then 'packaging'
    when p.type in ('ingredient', 'semi_finished', 'finished') then 'food'
    else 'other'
  end
  from public.erp_products p where p.id = p_product;
$$;

-- Pure-ish explode: dish + nested recipes with stocked-prep stop (reuse erp_count_stocked).
-- Modifiers: add / exclude / replace / choose. Unmapped external → mapping_required (no guessing).
create or replace function public.erp_sales_bom_explode(
  p_dish_id uuid,
  p_qty numeric,
  p_modifiers jsonb default '[]'::jsonb,
  p_prep_product_ids uuid[] default '{}',
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_lines jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_status text := 'complete';
  v_row record;
  v_mod jsonb;
  v_map public.erp_modifier_product_maps%rowtype;
  v_pid uuid;
  v_qty numeric;
  v_from uuid;
  v_to uuid;
  v_op text;
  v_ext text;
  v_name text;
  v_agg jsonb;
  v_has_prep boolean := coalesce(array_length(p_prep_product_ids, 1), 0) > 0;
  v_prep uuid;
  v_pack record;
begin
  if p_qty is null or p_qty <= 0 then
    perform public.erp_raise('ERP_INVALID', 'qty');
  end if;
  if p_dish_id is null then
    perform public.erp_raise('ERP_INVALID', 'dish_id');
  end if;
  if not exists (select 1 from public.erp_dishes where id = p_dish_id) then
    perform public.erp_raise('ERP_RECIPE_MISSING', 'dish');
  end if;
  if not exists (select 1 from public.erp_dish_lines where dish_id = p_dish_id) then
    perform public.erp_raise('ERP_RECIPE_MISSING', p_dish_id::text);
  end if;

  if v_has_prep then
    -- Consume chosen prep products as stocked items (do not re-explode their raw BOM).
    foreach v_prep in array p_prep_product_ids
    loop
      if v_prep is null then continue; end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_prep,
        'qty', round(p_qty, 6),
        'cogs_kind', public.erp_sales_cogs_kind(v_prep),
        'source_kind', 'prep_choice',
        'source_id', p_dish_id,
        'mapping_status', 'mapped'
      ));
    end loop;
    -- Still include packaging (and non-prep dish lines that are packaging/consumable)
    for v_pack in
      select dl.product_id, dl.qty
      from public.erp_dish_lines dl
      join public.erp_products p on p.id = dl.product_id
      where dl.dish_id = p_dish_id
        and p.type in ('packaging', 'consumable')
    loop
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.product_id,
        'qty', round(v_pack.qty * p_qty, 6),
        'cogs_kind', public.erp_sales_cogs_kind(v_pack.product_id),
        'source_kind', 'dish_packaging',
        'source_id', p_dish_id,
        'mapping_status', 'mapped'
      ));
    end loop;
  else
    begin
      for v_row in
        select * from public.erp_count_explode('dish', p_dish_id, p_qty, p_at, '{}'::uuid[])
      loop
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'product_id', v_row.product_id,
          'qty', round(v_row.qty, 6),
          'cogs_kind', public.erp_sales_cogs_kind(v_row.product_id),
          'source_kind', v_row.source_kind,
          'source_id', v_row.source_id,
          'recipe_id', v_row.recipe_id,
          'mapping_status', 'mapped'
        ));
      end loop;
    exception when others then
      v_status := 'error';
      v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'explode_error', 'detail', SQLERRM));
    end;
  end if;

  -- Apply modifiers
  for v_mod in select * from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb))
  loop
    v_op := lower(coalesce(v_mod->>'op', v_mod->>'action', 'add'));
    v_ext := nullif(v_mod->>'external_key', '');
    v_name := nullif(v_mod->>'external_name', '');
    v_pid := nullif(v_mod->>'product_id', '')::uuid;
    v_from := nullif(coalesce(v_mod->>'from_product_id', v_mod->>'replace_from'), '')::uuid;
    v_to := nullif(coalesce(v_mod->>'to_product_id', v_mod->>'replace_to', v_mod->>'product_id'), '')::uuid;
    v_qty := coalesce(nullif(v_mod->>'qty', '')::numeric, 1) * p_qty;

    if v_pid is null and v_ext is not null then
      select * into v_map
      from public.erp_modifier_product_maps
      where is_active and source_system = coalesce(nullif(v_mod->>'source_system', ''), 'poster')
        and external_key = v_ext
      limit 1;
      if found and v_map.product_id is not null then
        v_pid := v_map.product_id;
        v_qty := coalesce(nullif(v_mod->>'qty', '')::numeric, v_map.default_qty) * p_qty;
        v_op := coalesce(nullif(v_mod->>'op', ''), v_map.op_hint, v_op);
      else
        v_status := 'mapping_required';
        v_warn := v_warn || jsonb_build_array(jsonb_build_object(
          'code', 'mapping_required', 'external_key', v_ext, 'external_name', v_name
        ));
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'product_id', null,
          'qty', v_qty,
          'cogs_kind', 'other',
          'source_kind', 'modifier',
          'mapping_status', 'mapping_required',
          'external_key', v_ext,
          'external_name', v_name
        ));
        continue;
      end if;
    end if;

    if v_op in ('exclude', 'remove') then
      if v_pid is null then
        v_status := 'mapping_required';
        v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'mapping_required_exclude', 'external_key', v_ext));
        continue;
      end if;
      select coalesce(jsonb_agg(
        case when (x->>'product_id') = v_pid::text
          then x || jsonb_build_object('qty', 0, 'mapping_status', 'excluded')
          else x end
      ), '[]'::jsonb) into v_lines
      from jsonb_array_elements(v_lines) x;
    elsif v_op in ('replace', 'choose') then
      if v_from is null or v_to is null then
        if v_ext is not null and v_to is null then
          v_status := 'mapping_required';
          v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'mapping_required_replace', 'external_key', v_ext));
        else
          v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'replace_incomplete'));
          if v_status = 'complete' then v_status := 'partial'; end if;
        end if;
        continue;
      end if;
      select coalesce(jsonb_agg(
        case when (x->>'product_id') = v_from::text
          then jsonb_build_object(
            'product_id', v_to,
            'qty', coalesce(nullif(v_mod->>'qty', '')::numeric, (x->>'qty')::numeric),
            'cogs_kind', public.erp_sales_cogs_kind(v_to),
            'source_kind', 'modifier_replace',
            'source_id', p_dish_id,
            'mapping_status', 'replaced',
            'meta', jsonb_build_object('replaced_from', v_from)
          )
          else x end
      ), '[]'::jsonb) into v_lines
      from jsonb_array_elements(v_lines) x;
    else
      -- add / extra
      if v_pid is null then
        v_status := 'mapping_required';
        continue;
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pid,
        'qty', round(v_qty, 6),
        'cogs_kind', public.erp_sales_cogs_kind(v_pid),
        'source_kind', 'modifier_add',
        'source_id', p_dish_id,
        'mapping_status', 'mapped',
        'external_key', v_ext,
        'external_name', v_name
      ));
    end if;
  end loop;

  -- Aggregate same product_id (exclude zero qty)
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', g.product_id,
      'qty', round(g.qty, 6),
      'cogs_kind', g.cogs_kind,
      'source_kind', g.source_kind,
      'source_id', g.source_id,
      'recipe_id', g.recipe_id,
      'mapping_status', g.mapping_status,
      'external_key', g.external_key,
      'external_name', g.external_name,
      'meta', g.meta
    ) order by g.cogs_kind, g.product_id::text), '[]'::jsonb)
  into v_agg
  from (
    select
      nullif(x->>'product_id', '')::uuid as product_id,
      sum((x->>'qty')::numeric) as qty,
      min(x->>'cogs_kind') as cogs_kind,
      min(x->>'source_kind') as source_kind,
      (array_agg(nullif(x->>'source_id', '')::uuid))[1] as source_id,
      (array_agg(nullif(x->>'recipe_id', '')::uuid))[1] as recipe_id,
      case when bool_or(x->>'mapping_status' = 'mapping_required') then 'mapping_required'
           when bool_or(x->>'mapping_status' = 'excluded') and sum((x->>'qty')::numeric) = 0 then 'excluded'
           when bool_or(x->>'mapping_status' = 'replaced') then 'replaced'
           else 'mapped' end as mapping_status,
      min(x->>'external_key') as external_key,
      min(x->>'external_name') as external_name,
      (array_agg(x->'meta'))[1] as meta
    from jsonb_array_elements(v_lines) x
    group by nullif(x->>'product_id', '')::uuid
  ) g
  where g.qty > 0 or g.mapping_status = 'mapping_required';

  return jsonb_build_object(
    'dish_id', p_dish_id,
    'quantity', p_qty,
    'status', v_status,
    'lines', coalesce(v_agg, '[]'::jsonb),
    'warnings', v_warn,
    'rule_ref', 'erp_sales_bom_explode@9f',
    'prep_product_ids', to_jsonb(coalesce(p_prep_product_ids, '{}'::uuid[])),
    'note', 'Stocked prep stops nested raw explode; future recipe edits do not rewrite this result once snapshotted'
  );
end;
$$;

-- Freeze BOM on a sales line (idempotent if snapshot already exists)
create or replace function public.erp_sales_bom_snapshot(p_line_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_line public.erp_sales_lines%rowtype;
  v_doc public.erp_sales_documents%rowtype;
  v_exp jsonb;
  v_id uuid;
  v_ln jsonb;
  v_no int := 0;
begin
  select * into v_line from public.erp_sales_lines where id = p_line_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_line.bom_snapshot_id is not null then
    return v_line.bom_snapshot_id;
  end if;
  select * into v_doc from public.erp_sales_documents where id = v_line.document_id;

  if v_line.dish_id is null and v_line.product_id is null
     and coalesce(array_length(v_line.prep_product_ids, 1), 0) = 0 then
    perform public.erp_raise('ERP_INVALID', 'no_dish_or_product');
  end if;

  if v_line.dish_id is not null then
    v_exp := public.erp_sales_bom_explode(
      v_line.dish_id, v_line.quantity, v_line.modifiers, v_line.prep_product_ids, coalesce(v_doc.updated_at, now())
    );
  elsif coalesce(array_length(v_line.prep_product_ids, 1), 0) > 0 then
    v_exp := jsonb_build_object(
      'status', 'complete', 'warnings', '[]'::jsonb, 'lines',
      (select coalesce(jsonb_agg(jsonb_build_object(
          'product_id', p, 'qty', v_line.quantity, 'cogs_kind', public.erp_sales_cogs_kind(p),
          'source_kind', 'prep_choice', 'mapping_status', 'mapped'
        )), '[]'::jsonb)
       from unnest(v_line.prep_product_ids) p)
    );
  else
    v_exp := jsonb_build_object(
      'status', 'complete', 'warnings', '[]'::jsonb, 'lines',
      jsonb_build_array(jsonb_build_object(
        'product_id', v_line.product_id,
        'qty', v_line.quantity,
        'cogs_kind', public.erp_sales_cogs_kind(v_line.product_id),
        'source_kind', 'product',
        'mapping_status', 'mapped'
      ))
    );
  end if;

  insert into public.erp_sales_bom_snapshots (
    sales_line_id, sales_document_id, dish_id, quantity, status, modifiers_snapshot,
    prep_product_ids, warnings, created_by
  ) values (
    p_line_id, v_line.document_id, v_line.dish_id, v_line.quantity,
    coalesce(v_exp->>'status', 'complete'),
    coalesce(v_line.modifiers, '[]'::jsonb),
    coalesce(v_line.prep_product_ids, '{}'),
    coalesce(v_exp->'warnings', '[]'::jsonb),
    v_actor
  ) returning id into v_id;

  for v_ln in select * from jsonb_array_elements(coalesce(v_exp->'lines', '[]'::jsonb))
  loop
    v_no := v_no + 1;
    insert into public.erp_sales_bom_snapshot_lines (
      snapshot_id, line_no, product_id, qty, cogs_kind, source_kind, source_id, recipe_id,
      mapping_status, external_key, external_name, meta
    ) values (
      v_id, v_no,
      nullif(v_ln->>'product_id', '')::uuid,
      (v_ln->>'qty')::numeric,
      coalesce(v_ln->>'cogs_kind', 'food'),
      v_ln->>'source_kind',
      nullif(v_ln->>'source_id', '')::uuid,
      nullif(v_ln->>'recipe_id', '')::uuid,
      coalesce(v_ln->>'mapping_status', 'mapped'),
      v_ln->>'external_key',
      v_ln->>'external_name',
      v_ln->'meta'
    );
  end loop;

  update public.erp_sales_lines set bom_snapshot_id = v_id, updated_at = now() where id = p_line_id;
  return v_id;
end;
$$;

-- Rewrite COGS post: explode → snapshot → FIFO consume; pending without negative stock.
create or replace function public.erp_sales_post_cogs(
  p_id uuid,
  p_actor text,
  p_auto_consume boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_line public.erp_sales_lines%rowtype;
  v_settings public.erp_settings%rowtype;
  v_allow boolean := false;
  v_wh uuid;
  v_stock_doc uuid;
  v_stock_line uuid;
  v_snap uuid;
  v_bl public.erp_sales_bom_snapshot_lines%rowtype;
  v_taken record;
  v_total numeric := 0;
  v_food numeric := 0;
  v_pack numeric := 0;
  v_pending boolean := false;
  v_reason text;
  v_move_id bigint;
  v_avail numeric;
  v_need numeric;
  v_kind text;
  v_line_food numeric;
  v_line_pack numeric;
  v_line_pending boolean;
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status not in ('posted', 'partially_refunded') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  if v_row.cogs_status = 'posted' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'actual_cogs', v_row.actual_cogs,
      'food_cogs', v_row.food_cogs, 'packaging_cogs', v_row.packaging_cogs);
  end if;

  select * into v_settings from public.erp_settings where id = 1;
  v_allow := coalesce(p_auto_consume, false) and coalesce(v_settings.sales_auto_consume_stock, false);
  v_wh := v_row.warehouse_id;

  if not v_allow then
    update public.erp_sales_documents set
      cogs_status = 'pending', cogs_pending_reason = 'auto_consume_disabled',
      stock_consume_enabled = false, updated_at = now(), updated_by = v_actor
    where id = p_id;
    update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'auto_consume_disabled'
    where document_id = p_id;
    return jsonb_build_object('ok', true, 'cogs_status', 'pending', 'reason', 'auto_consume_disabled');
  end if;

  if v_wh is null then
    update public.erp_sales_documents set
      cogs_status = 'pending', cogs_pending_reason = 'warehouse_missing', updated_at = now(), updated_by = v_actor
    where id = p_id;
    return jsonb_build_object('ok', false, 'cogs_status', 'pending', 'reason', 'warehouse_missing');
  end if;

  if v_row.stock_document_id is null then
    insert into public.erp_documents (
      doc_type, doc_no, status, warehouse_id, doc_date, reason, comment, created_by, updated_by
    ) values (
      'writeoff', 'SL-' || replace(p_id::text, '-', ''), 'draft', v_wh, v_row.business_date,
      'sales_cogs', 'sales_cogs:' || p_id::text, v_actor, v_actor
    ) returning id into v_stock_doc;
    update public.erp_sales_documents set stock_document_id = v_stock_doc where id = p_id;
  else
    v_stock_doc := v_row.stock_document_id;
  end if;

  for v_line in select * from public.erp_sales_lines where document_id = p_id order by line_no
  loop
    v_line_food := 0; v_line_pack := 0; v_line_pending := false;
    if exists (
      select 1 from public.erp_sales_cogs_allocations
      where sales_line_id = v_line.id and not is_reversal and not is_adjustment
    ) then
      -- already consumed for this line
      update public.erp_sales_lines set
        cogs_status = 'posted',
        actual_cogs = (select coalesce(sum(amount),0) from public.erp_sales_cogs_allocations where sales_line_id = v_line.id and not is_reversal),
        food_cogs = (select coalesce(sum(amount),0) from public.erp_sales_cogs_allocations where sales_line_id = v_line.id and not is_reversal and cogs_kind='food'),
        packaging_cogs = (select coalesce(sum(amount),0) from public.erp_sales_cogs_allocations where sales_line_id = v_line.id and not is_reversal and cogs_kind='packaging'),
        original_actual_cogs = coalesce(original_actual_cogs, actual_cogs),
        adjusted_actual_cogs = coalesce(original_actual_cogs, actual_cogs) + coalesce(cogs_adjustment_total, 0)
      where id = v_line.id;
      continue;
    end if;

    begin
      v_snap := public.erp_sales_bom_snapshot(v_line.id, v_actor);
    exception when others then
      v_pending := true;
      v_line_pending := true;
      v_reason := coalesce(v_reason || '; ', '') || 'bom:' || SQLERRM;
      update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = left('bom_error:' || SQLERRM, 500)
      where id = v_line.id;
      continue;
    end;

    if exists (
      select 1 from public.erp_sales_bom_snapshots s
      where s.id = v_snap and s.status = 'mapping_required'
    ) then
      v_pending := true;
      v_line_pending := true;
      v_reason := coalesce(v_reason || '; ', '') || 'mapping_required:' || v_line.id::text;
      update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'mapping_required'
      where id = v_line.id;
      -- still try to consume mapped lines
    end if;

    for v_bl in
      select * from public.erp_sales_bom_snapshot_lines
      where snapshot_id = v_snap and mapping_status in ('mapped', 'replaced') and product_id is not null and qty > 0
      order by line_no
    loop
      v_need := v_bl.qty;
      v_kind := coalesce(v_bl.cogs_kind, 'food');
      select coalesce(sum(qty_left), 0) into v_avail
      from public.erp_lots
      where product_id = v_bl.product_id and warehouse_id = v_wh and qty_left > 0;

      if v_avail + 0.0000001 < v_need then
        v_pending := true;
        v_line_pending := true;
        v_reason := coalesce(v_reason || '; ', '') || 'insufficient:' || v_bl.product_id::text;
        insert into public.erp_sales_pending_cogs (
          sales_document_id, sales_line_id, product_id, warehouse_id, missing_qty, reason, created_by
        ) values (
          p_id, v_line.id, v_bl.product_id, v_wh, round(v_need - v_avail, 6), 'insufficient_stock', v_actor
        );
        -- consume what is available if any (partial); never invent stock
        if v_avail <= 0 then
          continue;
        end if;
        v_need := v_avail;
      end if;

      begin
        insert into public.erp_document_lines (document_id, line_no, product_id, qty)
        values (
          v_stock_doc,
          (select coalesce(max(line_no),0)+1 from public.erp_document_lines where document_id = v_stock_doc),
          v_bl.product_id, v_need
        ) returning id into v_stock_line;

        for v_taken in select * from public.erp_consume(v_stock_doc, v_stock_line, v_bl.product_id, v_wh, v_need, v_actor)
        loop
          select id into v_move_id from public.erp_movements
          where document_id = v_stock_doc and line_id = v_stock_line and lot_id = v_taken.lot_id
          order by id desc limit 1;
          insert into public.erp_sales_cogs_allocations (
            sales_document_id, sales_line_id, product_id, warehouse_id, lot_id, movement_id,
            qty, unit_cost, amount, cogs_kind, bom_snapshot_line_id, created_by
          ) values (
            p_id, v_line.id, v_bl.product_id, v_wh, v_taken.lot_id, v_move_id,
            v_taken.qty, v_taken.unit_cost,
            case when v_taken.unit_cost is null then null else round(v_taken.qty * v_taken.unit_cost, 4) end,
            v_kind, v_bl.id, v_actor
          );
          if v_taken.unit_cost is null then
            v_pending := true;
            v_line_pending := true;
            v_reason := coalesce(v_reason || '; ', '') || 'unknown_cost:' || v_bl.product_id::text;
          else
            if v_kind = 'packaging' then
              v_line_pack := v_line_pack + round(v_taken.qty * v_taken.unit_cost, 4);
            else
              v_line_food := v_line_food + round(v_taken.qty * v_taken.unit_cost, 4);
            end if;
          end if;
        end loop;
      exception when others then
        if sqlerrm like '%ERP_INSUFFICIENT_STOCK%' or sqlerrm like '%INSUFFICIENT%' then
          v_pending := true;
          v_line_pending := true;
          v_reason := coalesce(v_reason || '; ', '') || 'insufficient:' || v_bl.product_id::text;
          insert into public.erp_sales_pending_cogs (
            sales_document_id, sales_line_id, product_id, warehouse_id, missing_qty, reason, created_by
          ) values (
            p_id, v_line.id, v_bl.product_id, v_wh, v_need, 'insufficient_stock', v_actor
          );
        else
          raise;
        end if;
      end;
    end loop;

    v_food := v_food + v_line_food;
    v_pack := v_pack + v_line_pack;
    v_total := v_total + v_line_food + v_line_pack;

    update public.erp_sales_lines set
      food_cogs = v_line_food,
      packaging_cogs = v_line_pack,
      actual_cogs = v_line_food + v_line_pack,
      original_actual_cogs = v_line_food + v_line_pack,
      adjusted_actual_cogs = v_line_food + v_line_pack + coalesce(cogs_adjustment_total, 0),
      cogs_status = case when v_line_pending then 'partial' else 'posted' end,
      cogs_pending_reason = case when v_line_pending then left(v_reason, 500) else null end,
      updated_at = now()
    where id = v_line.id;
  end loop;

  update public.erp_documents set status = 'posted', posted_at = now(), posted_by = v_actor, updated_by = v_actor
  where id = v_stock_doc and status = 'draft';

  update public.erp_sales_documents set
    food_cogs = v_food,
    packaging_cogs = v_pack,
    actual_cogs = v_total,
    original_actual_cogs = v_total,
    adjusted_actual_cogs = v_total + coalesce(cogs_adjustment_total, 0),
    cogs_status = case when v_pending then 'partial' else 'posted' end,
    cogs_pending_reason = v_reason,
    stock_consume_enabled = true,
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'actual_cogs', v_total,
    'food_cogs', v_food,
    'packaging_cogs', v_pack,
    'cogs_status', case when v_pending then 'partial' else 'posted' end,
    'pending_reason', v_reason,
    'stock_document_id', v_stock_doc,
    'note', 'Missing cost never treated as zero; pending recorded separately'
  );
end;
$$;

-- Drop prior 4-arg overload so money-refund path is single canonical signature.
drop function if exists public.erp_refund_sales_document(uuid, text, numeric, boolean);

-- Money refund without automatic stock restore
create or replace function public.erp_refund_sales_document(
  p_id uuid,
  p_actor text,
  p_amount numeric default null,
  p_full boolean default false,
  p_restore_stock boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_amt numeric;
  v_policy text;
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status not in ('posted', 'partially_refunded') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  v_amt := case when p_full then coalesce(v_row.gross_sales, 0) else coalesce(p_amount, 0) end;
  if v_amt <= 0 then perform public.erp_raise('ERP_INVALID', 'refund_amount'); end if;
  if v_amt > coalesce(v_row.gross_sales, 0) then perform public.erp_raise('ERP_INVALID', 'refund_gt_gross'); end if;

  v_policy := case
    when coalesce(p_restore_stock, false) then 'physical_stock_return'
    when v_row.cogs_status in ('none', 'pending') and v_row.stock_document_id is null then 'cancel_before_prep'
    else 'refund_without_stock_return'
  end;

  if coalesce(p_restore_stock, false) then
    perform public.erp_raise('ERP_INVALID', 'physical_stock_return_requires_manual_document');
  end if;

  update public.erp_sales_documents set
    order_status = case when p_full or v_amt >= coalesce(gross_sales, 0) then 'refunded' else 'partially_refunded' end,
    payment_status = case when p_full or v_amt >= coalesce(gross_sales, 0) then 'refunded' else payment_status end,
    refund_stock_policy = v_policy,
    notes = trim(both from coalesce(notes, '') || format(
      E'\nrefund %s by %s at %s policy=%s (no auto ingredient restore)',
      v_amt, v_actor, now(), v_policy
    )),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

-- Apply VAT cost adjustment into COGS adjustment layer (does not rewrite original consume)
create or replace function public.erp_sales_apply_vat_cogs_adjustment(
  p_sales_id uuid,
  p_vat_adjustment_id uuid,
  p_amount numeric,
  p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_line_id uuid;
  v_alloc uuid;
begin
  select * into v_row from public.erp_sales_documents where id = p_sales_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if p_amount is null or p_amount = 0 then perform public.erp_raise('ERP_INVALID', 'amount'); end if;
  if exists (
    select 1 from public.erp_sales_cogs_allocations
    where sales_document_id = p_sales_id and vat_adjustment_id = p_vat_adjustment_id and is_adjustment
  ) then
    select id into v_alloc from public.erp_sales_cogs_allocations
    where sales_document_id = p_sales_id and vat_adjustment_id = p_vat_adjustment_id and is_adjustment
    limit 1;
    return v_alloc; -- idempotent
  end if;

  select id into v_line_id from public.erp_sales_lines where document_id = p_sales_id order by line_no limit 1;
  if v_line_id is null then perform public.erp_raise('ERP_INVALID', 'no_lines'); end if;

  insert into public.erp_sales_cogs_allocations (
    sales_document_id, sales_line_id, product_id, warehouse_id, qty, unit_cost, amount,
    cogs_kind, is_adjustment, vat_adjustment_id, created_by
  )
  select
    p_sales_id, v_line_id,
    coalesce(
      (select product_id from public.erp_sales_cogs_allocations where sales_document_id = p_sales_id and not is_adjustment and product_id is not null limit 1),
      (select product_id from public.erp_sales_lines where id = v_line_id and product_id is not null),
      (select product_id from public.erp_sales_bom_snapshot_lines sl
         join public.erp_sales_bom_snapshots s on s.id = sl.snapshot_id
         where s.sales_line_id = v_line_id and sl.product_id is not null limit 1),
      (select id from public.erp_products where type = 'ingredient' limit 1)
    ),
    coalesce(v_row.warehouse_id, (select id from public.erp_warehouses limit 1)),
    1, p_amount, p_amount, 'food', true, p_vat_adjustment_id, v_actor
  returning id into v_alloc;

  update public.erp_sales_documents set
    cogs_adjustment_total = coalesce(cogs_adjustment_total, 0) + p_amount,
    adjusted_actual_cogs = coalesce(original_actual_cogs, actual_cogs, 0) + coalesce(cogs_adjustment_total, 0) + p_amount,
    updated_at = now(), updated_by = v_actor
  where id = p_sales_id;

  update public.erp_sales_lines set
    cogs_adjustment_total = coalesce(cogs_adjustment_total, 0) + p_amount,
    adjusted_actual_cogs = coalesce(original_actual_cogs, actual_cogs, 0) + coalesce(cogs_adjustment_total, 0) + p_amount,
    updated_at = now()
  where id = v_line_id;

  return v_alloc;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_sales_cogs_kind', 'erp_sales_bom_explode', 'erp_sales_bom_snapshot',
             'erp_sales_post_cogs', 'erp_refund_sales_document', 'erp_sales_apply_vat_cogs_adjustment'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

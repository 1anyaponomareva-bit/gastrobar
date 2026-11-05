-- Production posting: reject non-positive yield (was a division-by-zero) and
-- batches with no consumed ingredients (was a zero-cost leftover of the output).
-- Compatible: replaces erp_post_document only.

create or replace function public.erp_post_document(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_settings public.erp_settings;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_out public.erp_products;
  v_taken record;
  v_now timestamptz := now();
  v_qty numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_rate numeric;
  v_unit_cost numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_current numeric;
  v_diff numeric;
  v_lines integer := 0;
  v_batch text;
  v_expires date;
  v_at timestamptz;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type = 'count' then
    return public.erp_post_count(p_id, p_actor);
  end if;
  if v_doc.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_doc.doc_no); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_settings from public.erp_settings where id = 1;
  v_at := coalesce(v_doc.occurred_at, v_doc.doc_date::timestamp at time zone public.erp_business_tz(), v_now);

  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  if v_doc.doc_type in ('transfer', 'production') then
    perform public.erp_check_warehouse(v_doc.target_warehouse_id, 'target_warehouse');
  end if;
  if v_doc.doc_type = 'transfer' and v_doc.warehouse_id = v_doc.target_warehouse_id then
    perform public.erp_raise('ERP_SAME_WAREHOUSE');
  end if;
  if v_doc.doc_type = 'production' then
    if v_doc.output_product_id is null then perform public.erp_raise('ERP_INVALID', 'output_product_id'); end if;
    if v_doc.output_qty is null or v_doc.output_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'output_qty'); end if;
    v_out := public.erp_check_product(v_doc.output_product_id);
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_lines := v_lines + 1;
    v_product := public.erp_check_product(v_line.product_id);
    v_qty := v_line.qty;
    v_line_cost := 0;
    v_line_known := true;
    v_net := null; v_vat := null; v_gross := null; v_current := null; v_diff := null;

    if v_doc.doc_type in ('opening', 'receipt') then
      if v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en); end if;
      if v_line.unit_price is null then
        v_unit_cost := null;
      else
        v_rate := coalesce(v_line.vat_rate, v_settings.default_input_vat_rate, 0);
        if v_settings.input_vat_enabled and v_doc.doc_type = 'receipt' then
          if v_doc.prices_include_vat then
            v_gross := round(v_qty * v_line.unit_price, 4);
            v_net := round(v_gross / (1 + v_rate / 100), 4);
          else
            v_net := round(v_qty * v_line.unit_price, 4);
            v_gross := round(v_net * (1 + v_rate / 100), 4);
          end if;
          v_vat := v_gross - v_net;
        else
          v_net := round(v_qty * v_line.unit_price, 4);
          v_gross := v_net;
          v_vat := 0;
        end if;
        v_unit_cost := v_net / v_qty;
      end if;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, v_unit_cost,
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_at, null, p_actor);
      v_line_known := v_unit_cost is not null;
      v_line_cost := v_net;
      if v_doc.doc_type = 'receipt' and v_unit_cost is not null then
        update public.erp_products
        set est_unit_cost = v_unit_cost, est_cost_source = 'receipt', est_cost_at = v_now, updated_by = p_actor
        where id = v_product.id;
      end if;

    elsif v_doc.doc_type in ('transfer', 'writeoff', 'production') then
      if v_qty <= 0 then
        if v_doc.doc_type = 'production' then continue; end if;
        perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en);
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost + v_taken.qty * v_taken.unit_cost; end if;
        if v_doc.doc_type = 'transfer' then
          perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.target_warehouse_id, v_taken.qty,
                                         v_taken.unit_cost, v_taken.batch_no, v_taken.expires_at,
                                         v_taken.received_at, v_taken.origin_lot_id, p_actor);
        end if;
      end loop;
    end if;

    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      net_amount = v_net, vat_amount = v_vat, gross_amount = v_gross,
      system_qty = v_current, diff_qty = v_diff,
      cost_amount = case when v_line_known then v_line_cost else null end,
      unit_cost = case when v_line_known and v_qty > 0 then round(v_line_cost / v_qty, 6) else null end,
      cost_known = v_line_known
    where id = v_line.id;

    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  if v_lines = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no); end if;
  if v_doc.doc_type = 'production' and not exists (
    select 1 from public.erp_document_lines where document_id = p_id and qty > 0
  ) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no);
  end if;

  if v_doc.doc_type = 'production' then
    v_batch := coalesce(v_doc.batch_no, v_doc.doc_no);
    v_expires := coalesce(v_doc.expires_at,
                          case when v_out.shelf_life_days is null then null else v_doc.doc_date + v_out.shelf_life_days end);
    v_unit_cost := case when v_known then round(v_total / v_doc.output_qty, 6) else null end;
    perform public.erp_receive_lot(p_id, null, v_out.id, v_doc.target_warehouse_id, v_doc.output_qty, v_unit_cost,
                                   v_batch, v_expires, v_at, null, p_actor);
    update public.erp_documents set output_unit_cost = v_unit_cost, batch_no = v_batch, expires_at = v_expires
    where id = p_id;
  end if;

  update public.erp_documents set
    status = 'posted', posted_at = v_now, posted_by = p_actor,
    occurred_at = coalesce(occurred_at, v_at),
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known);
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'erp_post_document'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;

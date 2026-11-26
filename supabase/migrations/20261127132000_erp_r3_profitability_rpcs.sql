-- Phase 9F-C: Channel / Location / Product profitability + control fixture.
-- Uses Actual sales + COGS + platform settlements. Estimated fees labeled separately.

-- Control math (test fixture §17)
create or replace function public.erp_profitability_control_math(
  p_net_revenue numeric default 100000,
  p_food_cogs numeric default 25000,
  p_pack_cogs numeric default 3000,
  p_commission numeric default 18000,
  p_advertising numeric default 7000
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_cogs numeric := coalesce(p_food_cogs,0) + coalesce(p_pack_cogs,0);
  v_gp numeric := coalesce(p_net_revenue,0) - v_cogs;
  v_cm numeric := v_gp - coalesce(p_commission,0) - coalesce(p_advertising,0);
begin
  return jsonb_build_object(
    'net_revenue', round(coalesce(p_net_revenue,0), 4),
    'food_actual_cogs', round(coalesce(p_food_cogs,0), 4),
    'packaging_actual_cogs', round(coalesce(p_pack_cogs,0), 4),
    'total_actual_cogs', round(v_cogs, 4),
    'gross_profit', round(v_gp, 4),
    'gross_margin_pct', case when coalesce(p_net_revenue,0) = 0 then null else round(v_gp / p_net_revenue * 100, 4) end,
    'actual_commission', round(coalesce(p_commission,0), 4),
    'actual_advertising', round(coalesce(p_advertising,0), 4),
    'contribution_margin', round(v_cm, 4),
    'contribution_margin_pct', case when coalesce(p_net_revenue,0) = 0 then null else round(v_cm / p_net_revenue * 100, 4) end,
    'rule_ref', 'erp_profitability_control_math@9f'
  );
end;
$$;

create or replace function public.erp_profitability_completeness(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sales int;
  v_cogs_posted int;
  v_cogs_pending int;
  v_unmatched int;
  v_pending_vat numeric;
  v_mapping int;
begin
  select count(*) into v_sales
  from public.erp_sales_documents
  where deleted_at is null and order_status in ('posted','partially_refunded','refunded')
    and business_date between p_from and p_to;

  select count(*) into v_cogs_posted
  from public.erp_sales_documents
  where deleted_at is null and order_status in ('posted','partially_refunded','refunded')
    and business_date between p_from and p_to and cogs_status = 'posted';

  select count(*) into v_cogs_pending
  from public.erp_sales_documents
  where deleted_at is null and order_status in ('posted','partially_refunded','refunded')
    and business_date between p_from and p_to and cogs_status in ('pending','partial','none');

  select count(*) into v_unmatched
  from public.erp_platform_settlement_lines
  where match_status in ('unmatched','conflict')
    and coalesce(settlement_date, created_at::date) between p_from and p_to;

  select coalesce(sum((t->>'pending_vat')::numeric), 0) into v_pending_vat
  from (
    select public.erp_input_vat_register(p_from, p_to, null, null, null, null, null, null, null)->'totals' as t
  ) x;

  select count(*) into v_mapping
  from public.erp_sales_bom_snapshots s
  join public.erp_sales_documents d on d.id = s.sales_document_id
  where s.status = 'mapping_required' and d.business_date between p_from and p_to;

  return jsonb_build_object(
    'sales_count', v_sales,
    'cogs_posted_count', v_cogs_posted,
    'cogs_pending_count', v_cogs_pending,
    'unmatched_platform_lines', v_unmatched,
    'pending_input_vat', v_pending_vat,
    'mapping_required_boms', v_mapping,
    'status', case
      when v_sales = 0 then 'Estimated'
      when v_cogs_pending > 0 or v_unmatched > 0 or v_mapping > 0 then 'Partial'
      when v_cogs_posted = v_sales then 'Complete'
      else 'Requires Reconciliation'
    end,
    'is_fully_actual', (v_sales > 0 and v_cogs_pending = 0 and v_unmatched = 0 and v_mapping = 0 and v_cogs_posted = v_sales)
  );
end;
$$;

create or replace function public.erp_profitability_channels(
  p_from date,
  p_to date,
  p_location uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rows jsonb;
  v_comp jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.net_revenue desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      sc.id as sales_channel_id,
      coalesce(sc.code, 'unknown') as channel_code,
      coalesce(sc.name, sc.code, 'Unknown') as channel_name,
      count(d.id) as order_count,
      coalesce(sum(d.gross_sales), 0) as gross_sales,
      coalesce(sum(d.merchant_funded_discount), 0) as merchant_funded_discounts,
      coalesce(sum(d.net_revenue), 0) as net_revenue,
      coalesce(sum(d.output_vat_amount), 0) as output_vat,
      coalesce(sum(d.food_cogs), 0) as food_actual_cogs,
      coalesce(sum(d.packaging_cogs), 0) as packaging_actual_cogs,
      coalesce(sum(coalesce(d.adjusted_actual_cogs, d.actual_cogs)), 0) as total_actual_cogs,
      coalesce(sum(d.estimated_cogs), 0) as estimated_cogs,
      coalesce(sum(d.net_revenue), 0) - coalesce(sum(coalesce(d.adjusted_actual_cogs, d.actual_cogs)), 0) as gross_profit,
      count(*) filter (where d.cogs_status in ('pending','partial','none')) as pending_cogs_orders
    from public.erp_sales_documents d
    left join public.erp_sales_channels sc on sc.id = d.sales_channel_id
    where d.deleted_at is null
      and d.order_status in ('posted','partially_refunded','refunded')
      and d.business_date between p_from and p_to
      and (p_location is null or d.business_location_id = p_location)
    group by sc.id, sc.code, sc.name
  ) r;

  -- Attach actual platform commission/ads by matching settlement dates (channel-level, not dish-allocated)
  v_rows := (
    select coalesce(jsonb_agg(
      x || jsonb_build_object(
        'actual_commission', coalesce((
          select sum(coalesce(l.platform_commission,0))
          from public.erp_platform_settlement_lines l
          where coalesce(l.settlement_date, l.created_at::date) between p_from and p_to
        ), 0),
        'actual_advertising', coalesce((
          select sum(coalesce(l.advertising_expense,0))
          from public.erp_platform_settlement_lines l
          where coalesce(l.settlement_date, l.created_at::date) between p_from and p_to
        ), 0),
        'unallocated_advertising_note', 'Campaign/location ads not auto-allocated to dishes',
        'gross_margin_pct', case when coalesce((x->>'net_revenue')::numeric,0)=0 then null
          else round(((x->>'gross_profit')::numeric) / (x->>'net_revenue')::numeric * 100, 4) end,
        'contribution_margin', round(
          coalesce((x->>'gross_profit')::numeric,0)
          - coalesce((
              select sum(coalesce(l.platform_commission,0)+coalesce(l.advertising_expense,0))
              from public.erp_platform_settlement_lines l
              where coalesce(l.settlement_date, l.created_at::date) between p_from and p_to
            ),0)
        , 4)
      )
    ), '[]'::jsonb)
    from jsonb_array_elements(v_rows) x
  );

  v_comp := public.erp_profitability_completeness(p_from, p_to);
  return jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'channels', v_rows,
    'completeness', v_comp,
    'disclaimer', 'Actual report — Estimated channel % not included. Grab Net Earnings ≠ net profit.'
  );
end;
$$;

create or replace function public.erp_profitability_locations(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.net_revenue desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      loc.id as location_id,
      loc.code as location_code,
      loc.name as location_name,
      count(d.id) as order_count,
      coalesce(sum(d.net_revenue), 0) as net_revenue,
      coalesce(sum(coalesce(d.adjusted_actual_cogs, d.actual_cogs)), 0) as total_actual_cogs,
      coalesce(sum(d.net_revenue), 0) - coalesce(sum(coalesce(d.adjusted_actual_cogs, d.actual_cogs)), 0) as gross_profit,
      count(*) filter (where d.cogs_status in ('pending','partial','none')) as pending_cogs_orders
    from public.erp_sales_documents d
    left join public.erp_locations loc on loc.id = d.business_location_id
    where d.deleted_at is null
      and d.order_status in ('posted','partially_refunded','refunded')
      and d.business_date between p_from and p_to
    group by loc.id, loc.code, loc.name
  ) r;

  return jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'locations', v_rows,
    'completeness', public.erp_profitability_completeness(p_from, p_to),
    'note', 'Prep Kitchen is cost center when it has no external sales; internal transfers ≠ revenue'
  );
end;
$$;

create or replace function public.erp_profitability_products(
  p_from date,
  p_to date,
  p_channel uuid default null,
  p_location uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.net_revenue desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      coalesce(l.dish_id, l.product_id) as item_id,
      coalesce(d.name_en, p.name_en, l.description, 'unknown') as item_name,
      case when l.dish_id is not null then 'dish' else 'product' end as item_kind,
      sum(l.quantity) as quantity_sold,
      coalesce(sum(l.gross_sales), 0) as gross_sales,
      coalesce(sum(l.net_revenue), 0) as net_revenue,
      coalesce(sum(l.food_cogs), 0) as food_actual_cogs,
      coalesce(sum(l.packaging_cogs), 0) as packaging_actual_cogs,
      coalesce(sum(coalesce(l.adjusted_actual_cogs, l.actual_cogs)), 0) as total_actual_cogs,
      coalesce(sum(l.estimated_cogs), 0) as estimated_cogs,
      coalesce(sum(l.estimated_cogs), 0) - coalesce(sum(coalesce(l.adjusted_actual_cogs, l.actual_cogs)), 0) as cogs_variance,
      coalesce(sum(l.net_revenue), 0) - coalesce(sum(coalesce(l.adjusted_actual_cogs, l.actual_cogs)), 0) as gross_profit,
      case when sum(l.quantity) = 0 then null else round(sum(l.gross_sales)/sum(l.quantity), 4) end as avg_selling_price,
      case when coalesce(sum(l.net_revenue),0)=0 then null
        else round((coalesce(sum(l.net_revenue),0) - coalesce(sum(coalesce(l.adjusted_actual_cogs, l.actual_cogs)),0)) / sum(l.net_revenue) * 100, 4)
      end as gross_margin_pct,
      bool_or(l.cogs_status in ('pending','partial','none')) as has_pending_cogs,
      'channel_expenses_not_auto_allocated_to_dish' as contribution_margin_note
    from public.erp_sales_lines l
    join public.erp_sales_documents s on s.id = l.document_id
    left join public.erp_dishes d on d.id = l.dish_id
    left join public.erp_products p on p.id = l.product_id
    where s.deleted_at is null
      and s.order_status in ('posted','partially_refunded','refunded')
      and s.business_date between p_from and p_to
      and (p_channel is null or s.sales_channel_id = p_channel)
      and (p_location is null or s.business_location_id = p_location)
    group by coalesce(l.dish_id, l.product_id), coalesce(d.name_en, p.name_en, l.description, 'unknown'),
             case when l.dish_id is not null then 'dish' else 'product' end
  ) r;

  return jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'products', v_rows,
    'completeness', public.erp_profitability_completeness(p_from, p_to),
    'note', 'Contribution Margin % omitted when channel expenses not reliably allocated to dish'
  );
end;
$$;

create or replace function public.erp_profitability_pending_cogs(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return coalesce((
    select jsonb_agg(to_jsonb(p) order by p.created_at desc)
    from public.erp_sales_pending_cogs p
    join public.erp_sales_documents d on d.id = p.sales_document_id
    where p.status = 'open'
      and (p_from is null or d.business_date >= p_from)
      and (p_to is null or d.business_date <= p_to)
  ), '[]'::jsonb);
end;
$$;

-- Extend load_state with pending cogs part if requested via core passthrough pattern
create or replace function public.erp_load_state(p_parts text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  want text[];
  out jsonb := '{}'::jsonb;
  prev jsonb;
begin
  want := string_to_array(nullif(btrim(coalesce(p_parts, '')), ''), ',');
  if to_regprocedure('public.erp_load_state_core(text)') is not null then
    prev := coalesce(public.erp_load_state_core(p_parts), '{}'::jsonb);
  else
    prev := '{}'::jsonb;
  end if;
  out := prev;

  -- Re-include 9E parts (same pattern as prior phases)
  if want is null or 'vatSettlements' = any(want) then
    out := out || jsonb_build_object('vatSettlements',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_vat_settlements order by period_end desc limit 500) r));
  end if;
  if want is null or 'vatCarryforwards' = any(want) then
    out := out || jsonb_build_object('vatCarryforwards',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_vat_carryforwards order by created_at desc limit 500) r));
  end if;
  if want is null or 'vatPayments' = any(want) then
    out := out || jsonb_build_object('vatPayments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.payment_date desc), '[]'::jsonb)
       from (select * from public.erp_vat_payments where status <> 'cancelled' order by payment_date desc limit 500) r));
  end if;
  if want is null or 'vatPeriodCorrections' = any(want) then
    out := out || jsonb_build_object('vatPeriodCorrections',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_vat_period_corrections order by created_at desc limit 500) r));
  end if;

  -- 9B/9D essentials often needed with profitability
  if want is null or 'salesDocuments' = any(want) then
    out := out || jsonb_build_object('salesDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc), '[]'::jsonb)
       from (select * from public.erp_sales_documents where deleted_at is null order by business_date desc limit 3000) r));
  end if;
  if want is null or 'salesLines' = any(want) then
    out := out || jsonb_build_object('salesLines',
      (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       from (select l.* from public.erp_sales_lines l join public.erp_sales_documents d on d.id=l.document_id
             where d.deleted_at is null order by l.document_id, l.line_no limit 20000) r));
  end if;
  if want is null or 'salesPendingCogs' = any(want) then
    out := out || jsonb_build_object('salesPendingCogs',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_pending_cogs where status='open' order by created_at desc limit 2000) r));
  end if;
  if want is null or 'salesBomSnapshots' = any(want) then
    out := out || jsonb_build_object('salesBomSnapshots',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.exploded_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_bom_snapshots order by exploded_at desc limit 2000) r));
  end if;

  return out;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_profitability_control_math', 'erp_profitability_completeness',
             'erp_profitability_channels', 'erp_profitability_locations',
             'erp_profitability_products', 'erp_profitability_pending_cogs', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

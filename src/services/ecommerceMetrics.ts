// Dashboard E-commerce V1: todas as agregações acontecem no banco (funções ecom_*).
import { supabase } from '@/integrations/supabase/client';
import type { Bucket } from '@/lib/ecommercePeriod';

export interface EcomSummary {
  current: { orders: number; revenue: number; shipping: number; total: number; customers: number; with_coupon_revenue: number };
  previous: { orders: number; revenue: number; customers: number };
  customers: { new: number; returning: number; recurring: number; repurchase: number };
  status: { test: number; pending: number; cancelled: number; other_invalid: number };
  bounds: { first_order_at: string | null; last_order_at: string | null };
}
export interface SeriesPoint { bucket_start: string; orders: number; revenue: number }
export interface ProductRow { product_key: string; product_name: string; quantity: number; orders: number; revenue: number }
export interface CouponRow { coupon: string | null; orders: number; revenue: number; avg_ticket: number; is_no_coupon: boolean }

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, force: boolean, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

const num = (v: unknown) => Number(v ?? 0);

export function fetchEcomSummary(from: string, to: string, force = false) {
  return cached(`s|${from}|${to}`, force, async () => {
    const { data, error } = await supabase.rpc('ecom_summary', { p_from: from, p_to: to });
    if (error) throw error;
    return data as unknown as EcomSummary;
  });
}

export function fetchEcomSeries(from: string, to: string, bucket: Bucket, force = false) {
  return cached(`t|${from}|${to}|${bucket}`, force, async () => {
    const { data, error } = await supabase.rpc('ecom_timeseries', { p_from: from, p_to: to, p_bucket: bucket });
    if (error) throw error;
    return (data || []).map((r) => ({ bucket_start: r.bucket_start, orders: num(r.orders), revenue: num(r.revenue) })) as SeriesPoint[];
  });
}

export function fetchTopProducts(from: string, to: string, order: 'quantity' | 'revenue', force = false) {
  return cached(`p|${from}|${to}|${order}`, force, async () => {
    const { data, error } = await supabase.rpc('ecom_top_products', { p_from: from, p_to: to, p_order: order, p_limit: 10 });
    if (error) throw error;
    return (data || []).map((r) => ({ ...r, quantity: num(r.quantity), orders: num(r.orders), revenue: num(r.revenue) })) as ProductRow[];
  });
}

export function fetchTopCoupons(from: string, to: string, force = false) {
  return cached(`c|${from}|${to}`, force, async () => {
    const { data, error } = await supabase.rpc('ecom_top_coupons', { p_from: from, p_to: to, p_limit: 10 });
    if (error) throw error;
    return (data || []).map((r) => ({ ...r, orders: num(r.orders), revenue: num(r.revenue), avg_ticket: num(r.avg_ticket) })) as CouponRow[];
  });
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

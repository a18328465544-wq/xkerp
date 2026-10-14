import { withDatabaseTransaction } from "./db.ts";

export type SalesCustomerPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type SalesCustomerRecord = {
  id: string;
  partnerType?: "customer" | "vendor";
  name?: string;
  phone?: string;
  contact?: string;
  contactPerson?: string;
  wechat?: string;
  qq?: string;
  level?: string;
  source?: string;
  firstChannel?: string;
  type?: string;
  partnerCategory?: string;
  crmStatus?: string;
};

function pageValue(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

/**
 * Sales orders must bind the durable customer archive id. The normalized CRM
 * account is an enrichment/read model and can temporarily lag a legacy write,
 * so it must never be the only source used by the order-entry picker.
 */
export function buildSalesCustomerPageQuery(filters: SalesCustomerPageFilters = {}) {
  const page = pageValue(filters.page, 1);
  const pageSize = Math.min(200, pageValue(filters.pageSize, 30));
  const values: unknown[] = [];
  const customerClauses: string[] = [];
  const vendorClauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) {
    const tenant = `tenant_id = ${bind(filters.tenantId.trim())}`;
    customerClauses.push(tenant);
    vendorClauses.push(tenant);
  }
  if (filters.storeId?.trim()) vendorClauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const pattern = bind(`%${keyword}%`);
    customerClauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'wechat', data->>'qq', data->>'company', data->>'remarks') ILIKE ${pattern}`);
    vendorClauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'contactPerson', data->>'type', data->>'remarks') ILIKE ${pattern}`);
  }
  const customerWhere = customerClauses.length ? `WHERE ${customerClauses.join(" AND ")}` : "";
  const vendorWhere = vendorClauses.length ? `WHERE ${vendorClauses.join(" AND ")}` : "";
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    // Keep `where` as a compatibility alias for callers/tests that only need
    // the customer archive scope. The picker query uses both partner scopes.
    where: customerWhere,
    customerWhere,
    vendorWhere,
  };
}

export async function listSalesCustomers(filters: SalesCustomerPageFilters = {}) {
  return withDatabaseTransaction(async (client) => {
    const query = buildSalesCustomerPageQuery(filters);
    const rows = await client.query<{ id: string; data: SalesCustomerRecord; partner_type: "customer" | "vendor" }>(
      `SELECT id, data, partner_type FROM (
         SELECT id, data, updated_at, 'customer'::text AS partner_type
         FROM gpu_customers ${query.customerWhere}
         UNION ALL
         SELECT id, data, updated_at, 'vendor'::text AS partner_type
         FROM gpu_vendors ${query.vendorWhere}
       ) AS sales_partners
       ORDER BY updated_at DESC NULLS LAST, id ASC, partner_type ASC
       LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
      [...query.values, query.pageSize, query.offset],
    );
    const count = await client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM (
         SELECT id FROM gpu_customers ${query.customerWhere}
         UNION ALL
         SELECT id FROM gpu_vendors ${query.vendorWhere}
       ) AS sales_partners`,
      query.values,
    );
    return {
      data: rows.rows.map((row) => ({ ...row.data, id: row.id, partnerType: row.partner_type })),
      meta: { page: query.page, pageSize: query.pageSize, total: Number(count.rows[0]?.total || 0) },
    };
  });
}

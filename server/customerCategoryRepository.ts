import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type CustomerCategory = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type CustomerCategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

function mapCategory(row: CustomerCategoryRow): CustomerCategory {
  return {id: row.id, name: row.name, isActive: row.is_active, sortOrder: row.sort_order};
}

export function normalizeCustomerCategoryName(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export async function listCustomerCategories(client: PoolClient, tenantId: string) {
  const result = await client.query<CustomerCategoryRow>(
    `SELECT id, name, is_active, sort_order
       FROM gpu_crm_customer_categories
      WHERE tenant_id = $1
      ORDER BY is_active DESC, sort_order ASC, name ASC, id ASC`,
    [tenantId],
  );
  return result.rows.map(mapCategory);
}

export async function createCustomerCategory(client: PoolClient, tenantId: string, name: string, actor: string) {
  const normalizedName = normalizeCustomerCategoryName(name);
  if (!normalizedName) throw new ValidationError("客户分类名称不能为空");
  const existing = await client.query<{id: string}>(
    "SELECT id FROM gpu_crm_customer_categories WHERE tenant_id = $1 AND normalized_name = $2 LIMIT 1",
    [tenantId, normalizedName],
  );
  if (existing.rowCount) throw new ConflictError("该客户分类已存在");
  const result = await client.query<CustomerCategoryRow>(
    `INSERT INTO gpu_crm_customer_categories
       (id, tenant_id, name, normalized_name, sort_order, created_by, updated_by)
     VALUES ($1, $2, $3, $4,
       COALESCE((SELECT MAX(sort_order) + 10 FROM gpu_crm_customer_categories WHERE tenant_id = $2), 10),
       $5, $5)
     RETURNING id, name, is_active, sort_order`,
    [`CC-${randomUUID()}`, tenantId, name.trim(), normalizedName, actor],
  );
  return mapCategory(result.rows[0]!);
}

export async function updateCustomerCategory(client: PoolClient, tenantId: string, id: string, updates: {name?: string; isActive?: boolean}, actor: string) {
  const currentResult = await client.query<CustomerCategoryRow & {normalized_name: string}>(
    `SELECT id, name, normalized_name, is_active, sort_order
       FROM gpu_crm_customer_categories
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE`,
    [tenantId, id],
  );
  const current = currentResult.rows[0];
  if (!current) throw new NotFoundError("客户分类不存在");
  const name = updates.name?.trim() ?? current.name;
  const normalizedName = normalizeCustomerCategoryName(name);
  if (!normalizedName) throw new ValidationError("客户分类名称不能为空");
  const duplicate = await client.query<{id: string}>(
    "SELECT id FROM gpu_crm_customer_categories WHERE tenant_id = $1 AND normalized_name = $2 AND id <> $3 LIMIT 1",
    [tenantId, normalizedName, id],
  );
  if (duplicate.rowCount) throw new ConflictError("该客户分类已存在");
  const result = await client.query<CustomerCategoryRow>(
    `UPDATE gpu_crm_customer_categories
        SET name = $3, normalized_name = $4, is_active = $5, updated_by = $6, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, name, is_active, sort_order`,
    [tenantId, id, name, normalizedName, updates.isActive ?? current.is_active, actor],
  );
  return mapCategory(result.rows[0]!);
}

export async function assertCustomerCategoryAssignable(client: PoolClient, tenantId: string, categoryId?: string | null, existingCategoryId?: string) {
  const id = categoryId?.trim();
  if (!id) return;
  const result = await client.query<{is_active: boolean}>(
    "SELECT is_active FROM gpu_crm_customer_categories WHERE tenant_id = $1 AND id = $2",
    [tenantId, id],
  );
  const category = result.rows[0];
  if (!category) throw new ValidationError("所选客户分类不存在或不属于当前租户");
  if (!category.is_active && id !== existingCategoryId) throw new ValidationError("已停用的客户分类不能分配给新客户");
}

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CustomerCard } from "../src/types.ts";

export type CrmCustomerSyncMode = "created" | "updated";

export type CrmCustomerProjection = {
  accountId: string;
  contactId: string;
  displayName: string;
  normalizedName: string;
  source: string;
  level?: string;
  ownerId?: string;
  primaryPhone?: string;
  primaryWechat?: string;
  primaryQq?: string;
  city?: string;
  companyName?: string;
  notes?: string;
  contactRole: string;
  sourceHash: string;
  eventId: string;
  eventType: "customer_created" | "customer_updated";
  idempotencyKey: string;
};

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeCrmAccountName(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function crmCustomerAccountId(customerId: string) {
  return `CRM-${stableHash(`customer:${customerId}`).slice(0, 16)}`;
}

export function buildCrmCustomerProjection(
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
  mode: CrmCustomerSyncMode,
): CrmCustomerProjection {
  const displayName = String(customer.name || "").trim();
  const primaryPhone = String(customer.phone || customer.contact || "").trim() || undefined;
  const primaryWechat = String(customer.wechat || "").trim() || undefined;
  const primaryQq = String(customer.qq || "").trim() || undefined;
  const source = String(customer.firstChannel || customer.source || "CRM").trim() || "CRM";
  const contactRole = String(customer.type || "客户联系人").trim() || "客户联系人";
  const sourceHash = stableHash(JSON.stringify({
    name: displayName,
    phone: primaryPhone || "",
    wechat: primaryWechat || "",
    qq: primaryQq || "",
    city: customer.city || "",
    company: customer.company || "",
    source,
    level: customer.level || "",
    owner: customer.owner || "",
    remarks: customer.remarks || "",
  }));
  const idempotencyKey = `legacy:crm_customer:${mode}:${customer.id}:${sourceHash}`;

  return {
    accountId: crmCustomerAccountId(customer.id),
    contactId: `CRM-CONTACT-${stableHash(`customer:${customer.id}`).slice(0, 16)}`,
    displayName,
    normalizedName: normalizeCrmAccountName(displayName),
    source,
    level: customer.level || undefined,
    ownerId: customer.owner || undefined,
    primaryPhone,
    primaryWechat,
    primaryQq,
    city: String(customer.city || "").trim() || undefined,
    companyName: String(customer.company || "").trim() || undefined,
    notes: customer.remarks?.trim() || undefined,
    contactRole,
    sourceHash,
    eventId: `CRM-TL-${stableHash(idempotencyKey).slice(0, 16)}`,
    eventType: mode === "created" ? "customer_created" : "customer_updated",
    idempotencyKey,
  };
}

async function findExistingAccountId(client: PoolClient, customerId: string) {
  const mapped = await client.query<{ account_id: string }>(
    `SELECT account_id
     FROM gpu_crm_legacy_map
     WHERE source_type = 'customer' AND source_id = $1
     LIMIT 1`,
    [customerId],
  );
  if (mapped.rows[0]?.account_id) return mapped.rows[0].account_id;

  const legacy = await client.query<{ id: string }>(
    `SELECT id
     FROM gpu_crm_accounts
     WHERE legacy_customer_id = $1
     ORDER BY updated_at DESC, id ASC
     LIMIT 1`,
    [customerId],
  );
  return legacy.rows[0]?.id;
}

/**
 * Synchronize one legacy customer into the normalized CRM主体 model.
 * The caller must execute this hook inside the same transaction as the legacy JSONB patch.
 */
export async function upsertCrmCustomerAccount(
  client: PoolClient,
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
  mode: CrmCustomerSyncMode,
  actorId?: string,
  options: { writeTimeline?: boolean } = {},
) {
  const projection = buildCrmCustomerProjection(customer, mode);
  const accountId = (await findExistingAccountId(client, customer.id)) || projection.accountId;

  await client.query(
    `INSERT INTO gpu_crm_accounts
       (id, account_type, display_name, normalized_name, status, level, owner_id, source, primary_phone, primary_wechat, primary_qq, city, company_name, notes, legacy_customer_id)
     VALUES ($1, 'individual', $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       normalized_name = EXCLUDED.normalized_name,
       status = 'active',
       level = EXCLUDED.level,
       owner_id = EXCLUDED.owner_id,
       source = EXCLUDED.source,
       primary_phone = EXCLUDED.primary_phone,
       primary_wechat = EXCLUDED.primary_wechat,
       primary_qq = EXCLUDED.primary_qq,
       city = EXCLUDED.city,
       company_name = EXCLUDED.company_name,
       notes = EXCLUDED.notes,
       legacy_customer_id = EXCLUDED.legacy_customer_id,
       updated_at = NOW(),
       deleted_at = NULL`,
    [
      accountId,
      projection.displayName,
      projection.normalizedName,
      projection.level || null,
      projection.ownerId || null,
      projection.source,
      projection.primaryPhone || null,
      projection.primaryWechat || null,
      projection.primaryQq || null,
      projection.city || null,
      projection.companyName || null,
      projection.notes || null,
      customer.id,
    ],
  );

  await client.query(
    `INSERT INTO gpu_crm_account_roles (account_id, role)
     VALUES ($1, 'customer')
     ON CONFLICT (account_id, role) DO NOTHING`,
    [accountId],
  );

  await client.query(
    `INSERT INTO gpu_crm_legacy_map (source_type, source_id, account_id, source_hash)
     VALUES ('customer', $1, $2, $3)
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       source_hash = EXCLUDED.source_hash,
       migrated_at = NOW()`,
    [customer.id, accountId, projection.sourceHash],
  );

  await client.query(
    `UPDATE gpu_crm_contacts
     SET is_primary = FALSE, updated_at = NOW()
     WHERE account_id = $1 AND id <> $2`,
    [accountId, projection.contactId],
  );
  await client.query(
    `INSERT INTO gpu_crm_contacts
       (id, account_id, name, phone, wechat, qq, contact_role, is_primary, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       wechat = EXCLUDED.wechat,
       qq = EXCLUDED.qq,
       contact_role = EXCLUDED.contact_role,
       is_primary = TRUE,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      projection.contactId,
      accountId,
      projection.displayName,
      projection.primaryPhone || null,
      projection.primaryWechat || null,
      projection.primaryQq || null,
      projection.contactRole,
      projection.notes || null,
    ],
  );

  if (options.writeTimeline !== false) {
    await client.query(
      `INSERT INTO gpu_crm_timeline_events
         (id, account_id, event_type, source_type, source_id, summary, payload, actor_id, idempotency_key)
       VALUES ($1, $2, $3, 'legacy_customer', $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        projection.eventId,
        accountId,
        projection.eventType,
        customer.id,
        mode === "created" ? `新增客户：${projection.displayName}` : `更新客户档案：${projection.displayName}`,
        JSON.stringify({ legacyCustomerId: customer.id, mode, sourceHash: projection.sourceHash }),
        actorId || null,
        projection.idempotencyKey,
      ],
    );
  }

  return { accountId, projection };
}

/** Ensure a legacy customer has a normalized主体 before writing a child CRM record. */
export async function ensureCrmCustomerAccount(
  client: PoolClient,
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
) {
  return upsertCrmCustomerAccount(client, customer, "updated", undefined, { writeTimeline: false });
}

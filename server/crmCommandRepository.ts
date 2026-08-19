import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CrmFollowUpRecord, CrmQuote, CrmRequirement, CustomerCard } from "../src/types.ts";
import { ensureCrmCustomerAccount } from "./crmAccountRepository.ts";

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizedId(prefix: string, sourceId: string) {
  return `${prefix}-${stableHash(sourceId)}`;
}

function dateOnly(value?: string) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 10) : null;
}

function quoteStatus(status: CrmQuote["status"]) {
  return {
    草稿: "draft",
    已发送: "sent",
    客户已确认: "accepted",
    已拒绝: "rejected",
    已过期: "expired",
  }[status] || "draft";
}

function opportunityStage(stage: CrmRequirement["stage"]) {
  return {
    需求确认: "qualification",
    报价中: "proposal",
    已成交: "won",
    已关闭: "closed",
  }[stage] || "qualification";
}

function requirementStatus(stage: CrmRequirement["stage"]) {
  return stage === "已成交" ? "won" : stage === "已关闭" ? "closed" : "open";
}

async function writeTimelineEvent(
  client: PoolClient,
  event: {
    id: string;
    accountId: string;
    eventType: string;
    sourceType: string;
    sourceId: string;
    summary: string;
    payload: Record<string, unknown>;
    actorId?: string;
    idempotencyKey: string;
    occurredAt?: string;
  },
) {
  await client.query(
    `INSERT INTO gpu_crm_timeline_events
       (id, account_id, event_type, source_type, source_id, summary, payload, actor_id, idempotency_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, COALESCE($10::timestamptz, NOW()))
     ON CONFLICT (idempotency_key) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       event_type = EXCLUDED.event_type,
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id,
       summary = EXCLUDED.summary,
       payload = EXCLUDED.payload,
       actor_id = EXCLUDED.actor_id,
       occurred_at = EXCLUDED.occurred_at`,
    [
      event.id,
      event.accountId,
      event.eventType,
      event.sourceType,
      event.sourceId,
      event.summary,
      JSON.stringify(event.payload),
      event.actorId || null,
      event.idempotencyKey,
      event.occurredAt || null,
    ],
  );
}

export async function syncCrmFollowUp(
  client: PoolClient,
  followup: CrmFollowUpRecord,
  customer: CustomerCard,
  actorId?: string,
) {
  const { accountId } = await ensureCrmCustomerAccount(client, customer);
  const id = normalizedId("CRM-FOLLOWUP", followup.id);
  await client.query(
    `INSERT INTO gpu_crm_followups
       (id, account_id, contact_method, content, result, handler_id, follow_time, next_follow_time, remarks, legacy_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       contact_method = EXCLUDED.contact_method,
       content = EXCLUDED.content,
       result = EXCLUDED.result,
       handler_id = EXCLUDED.handler_id,
       follow_time = EXCLUDED.follow_time,
       next_follow_time = EXCLUDED.next_follow_time,
       remarks = EXCLUDED.remarks,
       legacy_id = EXCLUDED.legacy_id,
       updated_at = NOW()`,
    [
      id,
      accountId,
      followup.contactMethod,
      followup.content,
      followup.result,
      followup.handler,
      followup.followTime || "1970-01-01T00:00:00.000Z",
      followup.nextFollowTime || null,
      [followup.nextAction, followup.lostReason, followup.remarks].filter(Boolean).join(" · ") || null,
      followup.id,
    ],
  );

  await writeTimelineEvent(client, {
    id: normalizedId("CRM-TL", `followup:${followup.id}`),
    accountId,
    eventType: "followup_recorded",
    sourceType: "crm_followup",
    sourceId: id,
    summary: `跟进记录：${followup.result}`,
    payload: { legacyId: followup.id, contactMethod: followup.contactMethod, nextAction: followup.nextAction || null },
    actorId,
    idempotencyKey: `legacy:crm_followup:${followup.id}`,
    occurredAt: followup.followTime,
  });
}

export async function syncCrmRequirement(
  client: PoolClient,
  requirement: CrmRequirement,
  customer: CustomerCard,
  actorId?: string,
) {
  const { accountId } = await ensureCrmCustomerAccount(client, customer);
  const requirementId = normalizedId("CRM-REQ", requirement.id);
  const opportunityId = normalizedId("CRM-OPP", requirement.id);
  const title = requirement.productDemand.trim() || "客户需求";
  const expectedDealAt = dateOnly(requirement.expectedDealTime);
  await client.query(
    `INSERT INTO gpu_crm_account_requirements
       (id, account_id, title, product_demand, budget, intent, stage, source, owner_id, expected_deal_at, status, remarks, legacy_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       title = EXCLUDED.title,
       product_demand = EXCLUDED.product_demand,
       budget = EXCLUDED.budget,
       intent = EXCLUDED.intent,
       stage = EXCLUDED.stage,
       source = EXCLUDED.source,
       owner_id = EXCLUDED.owner_id,
       expected_deal_at = EXCLUDED.expected_deal_at,
       status = EXCLUDED.status,
       remarks = EXCLUDED.remarks,
       legacy_id = EXCLUDED.legacy_id,
       updated_at = NOW()`,
    [
      requirementId,
      accountId,
      title,
      requirement.productDemand,
      Number(requirement.budget) || 0,
      requirement.intent,
      requirement.stage,
      requirement.source,
      requirement.handler,
      expectedDealAt,
      requirementStatus(requirement.stage),
      [requirement.nextAction, requirement.remarks].filter(Boolean).join(" · ") || null,
      requirement.id,
    ],
  );

  await client.query(
    `INSERT INTO gpu_crm_opportunities
       (id, account_id, requirement_id, title, stage, amount, probability, owner_id, expected_close_at, lost_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       requirement_id = EXCLUDED.requirement_id,
       title = EXCLUDED.title,
       stage = EXCLUDED.stage,
       amount = EXCLUDED.amount,
       probability = EXCLUDED.probability,
       owner_id = EXCLUDED.owner_id,
       expected_close_at = EXCLUDED.expected_close_at,
       lost_reason = EXCLUDED.lost_reason,
       updated_at = NOW()`,
    [
      opportunityId,
      accountId,
      requirementId,
      title,
      opportunityStage(requirement.stage),
      Number(requirement.estimatedAmount ?? requirement.budget) || 0,
      Math.max(0, Math.min(100, Number(requirement.dealProbability) || 0)),
      requirement.handler,
      expectedDealAt,
      requirement.stage === "已关闭" ? requirement.remarks || "需求已关闭" : null,
    ],
  );

  await writeTimelineEvent(client, {
    id: normalizedId("CRM-TL", `requirement:${requirement.id}`),
    accountId,
    eventType: "requirement_created",
    sourceType: "crm_requirement",
    sourceId: requirementId,
    summary: `新增需求：${title}`,
    payload: { legacyId: requirement.id, stage: requirement.stage, budget: Number(requirement.budget) || 0, opportunityId },
    actorId,
    idempotencyKey: `legacy:crm_requirement:${requirement.id}`,
    occurredAt: requirement.createTime,
  });
}

export async function syncCrmQuote(
  client: PoolClient,
  quote: CrmQuote,
  customer: CustomerCard,
  actorId?: string,
) {
  const { accountId } = await ensureCrmCustomerAccount(client, customer);
  const quoteId = normalizedId("CRM-QUOTE", quote.id);
  const status = quoteStatus(quote.status);
  await client.query(
    `INSERT INTO gpu_crm_quotes
       (id, account_id, quote_no, version, status, total_amount, valid_until, owner_id, remarks)
     VALUES ($1, $2, $3, 1, $4, $5, $6::date, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       quote_no = EXCLUDED.quote_no,
       status = EXCLUDED.status,
       total_amount = EXCLUDED.total_amount,
       valid_until = EXCLUDED.valid_until,
       owner_id = EXCLUDED.owner_id,
       remarks = EXCLUDED.remarks,
       updated_at = NOW()`,
    [quoteId, accountId, quote.quoteNo, status, Number(quote.totalAmount) || 0, dateOnly(quote.validUntil), quote.owner || actorId || null, quote.notes || null],
  );

  await client.query("DELETE FROM gpu_crm_quote_items WHERE quote_id = $1", [quoteId]);
  for (const [index, item] of quote.items.entries()) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    if (quantity <= 0 || unitPrice < 0 || !item.productName.trim()) continue;
    await client.query(
      `INSERT INTO gpu_crm_quote_items
         (id, quote_id, product_id, product_name, quantity, unit_price, amount, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        normalizedId("CRM-QI", `${quote.id}:${index}:${item.id}`),
        quoteId,
        item.productId || null,
        item.productName.trim(),
        quantity,
        unitPrice,
        quantity * unitPrice,
        item.remarks || null,
      ],
    );
  }

  await writeTimelineEvent(client, {
    id: normalizedId("CRM-TL", `quote:${quote.id}`),
    accountId,
    eventType: "quote_created",
    sourceType: "crm_quote",
    sourceId: quoteId,
    summary: `生成报价单：${quote.quoteNo}`,
    payload: { legacyId: quote.id, quoteNo: quote.quoteNo, totalAmount: Number(quote.totalAmount) || 0, status: quote.status },
    actorId,
    idempotencyKey: `legacy:crm_quote:${quote.id}`,
    occurredAt: quote.createdAt,
  });
}

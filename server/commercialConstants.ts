/**
 * Commercial tenancy defaults used while the legacy single-store dataset is
 * upgraded.  Existing rows are assigned to this tenant by the additive
 * migration; new deployments can create additional tenants through the
 * provisioning repository without changing the legacy business identifiers.
 */
export const DEFAULT_TENANT_ID = "tenant_default";
export const DEFAULT_STORE_ID = "store_default";
export const DEFAULT_TENANT_SLUG = "default";
export const DEFAULT_TENANT_NAME = "默认企业";
export const DEFAULT_STORE_NAME = "主门店";
export const DEFAULT_STORE_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_CURRENCY = "CNY";

export type TenantStatus = "active" | "suspended" | "archived";
export type MembershipStatus = "active" | "invited" | "deactivated";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type CommercialPlanCode = "pilot" | "standard" | "pro" | "enterprise";

export const COMMERCIAL_PLAN_DEFAULTS: Record<CommercialPlanCode, {
  seatLimit: number;
  mediaBytesLimit: number;
  aiTokensLimit: number;
  featureFlags: string[];
}> = {
  pilot: {
    seatLimit: 3,
    mediaBytesLimit: 1_000_000_000,
    aiTokensLimit: 100_000,
    featureFlags: ["core", "reports", "ai_assist"],
  },
  standard: {
    seatLimit: 10,
    mediaBytesLimit: 10_000_000_000,
    aiTokensLimit: 1_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm"],
  },
  pro: {
    seatLimit: 50,
    mediaBytesLimit: 100_000_000_000,
    aiTokensLimit: 10_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm", "integrations"],
  },
  enterprise: {
    seatLimit: 500,
    mediaBytesLimit: 1_000_000_000_000,
    aiTokensLimit: 100_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm", "integrations", "sso"],
  },
};

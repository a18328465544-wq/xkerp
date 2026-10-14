import type { Express, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../httpAuth.ts";
import { listSalesCustomers } from "../salesCustomerRepository.ts";
import { parseHttpDto, salesCustomerListQueryDto } from "../httpDto.ts";

type SalesCustomerRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
};

export function salesPartnerPickerItem(partner: Awaited<ReturnType<typeof listSalesCustomers>>["data"][number]) {
  const partnerType = partner.partnerType === "vendor" ? "vendor" : "customer";
  const name = String(partner.name || "").trim() || (partnerType === "vendor" ? "未命名供应商" : "未命名客户");
  const phone = String(partner.phone || partner.contact || "").trim();
  const wechat = String(partner.wechat || "").trim();
  const qq = String(partner.qq || "").trim();
  const contactPerson = String(partner.contactPerson || "").trim();
  const identity = {id: partner.id, name, phone: phone || undefined, contact: phone || wechat || qq || contactPerson || undefined, level: partner.level, type: partner.type};
  const vendor = partnerType === "vendor" ? {
    ...identity,
    contactPerson: contactPerson || undefined,
    partnerCategory: partner.partnerCategory,
  } : undefined;
  const customer = partnerType === "customer" ? {
    ...identity,
    contact: phone || wechat || qq || undefined,
    wechat: wechat || undefined,
    qq: qq || undefined,
    source: partner.source,
    firstChannel: partner.firstChannel,
  } : undefined;
  return {
    id: `${partnerType === "vendor" ? "VENDOR" : "CUSTOMER"}-${partner.id}`,
    accountType: "individual",
    displayName: name,
    normalizedName: name.toLocaleLowerCase("zh-CN").replace(/\s+/g, " "),
    status: partner.crmStatus || "active",
    level: partner.level,
    source: partnerType === "vendor" ? partner.type : partner.firstChannel || partner.source,
    primaryPhone: phone || undefined,
    primaryWechat: wechat || undefined,
    primaryQq: qq || undefined,
    roles: partnerType === "vendor" ? ["vendor", "supplier"] : ["customer"],
    ...(customer ? {legacyCustomer: customer} : {}),
    ...(vendor ? {legacyVendor: vendor} : {}),
  };
}

/** Customer and supplier archive-backed picker for sales entry. */
export function registerSalesCustomerRoutes(app: Express, dependencies: SalesCustomerRouteDependencies) {
  app.get("/api/sales/customers", dependencies.requireMenu("sales_add"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const query = parseHttpDto(salesCustomerListQueryDto, req.query);
      const result = await listSalesCustomers({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword || query.search,
      });
      res.json({ data: { items: result.data.map(salesPartnerPickerItem), meta: result.meta } });
    } catch (error) {
      next(error);
    }
  });
}

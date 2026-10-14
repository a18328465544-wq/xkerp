import assert from "node:assert/strict";
import test from "node:test";
import {salesPartnerPickerItem} from "./salesCustomers.ts";

test("sales partner picker maps suppliers to selectable vendor archive identities", () => {
  const item = salesPartnerPickerItem({
    id: "GY-1",
    partnerType: "vendor",
    name: "显卡同行",
    phone: "13800000000",
    contactPerson: "李师傅",
    type: "上游供应商",
    partnerCategory: "显卡渠道",
    level: "A级",
    crmStatus: "active",
  });

  assert.equal(item.id, "VENDOR-GY-1");
  assert.equal(item.displayName, "显卡同行");
  assert.deepEqual(item.roles, ["vendor", "supplier"]);
  assert.equal(item.legacyVendor?.id, "GY-1");
  assert.equal(item.legacyVendor?.contactPerson, "李师傅");
  assert.equal(item.legacyVendor?.partnerCategory, "显卡渠道");
  assert.equal("legacyCustomer" in item, false);
  assert.equal("accountPayable" in item, false);
  assert.equal("returnCreditBalance" in item, false);
});

test("sales partner picker keeps customer archive identities unchanged", () => {
  const item = salesPartnerPickerItem({
    id: "KH-1",
    partnerType: "customer",
    name: "张三",
    phone: "13900000000",
    wechat: "zhangsan",
    source: "闲鱼",
    firstChannel: "闲鱼",
    level: "B级",
  });

  assert.equal(item.id, "CUSTOMER-KH-1");
  assert.deepEqual(item.roles, ["customer"]);
  assert.equal(item.legacyCustomer?.id, "KH-1");
  assert.equal(item.legacyCustomer?.wechat, "zhangsan");
  assert.equal("legacyVendor" in item, false);
});

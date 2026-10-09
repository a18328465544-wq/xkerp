import assert from "node:assert/strict";
import test from "node:test";
import {createSalesDefaults} from "../sales.defaults";
import {salesOrderSchema} from "../sales.schema";

test("sales defaults have needInvoice=false and freeShipping=false (运费到付)", () => {
  const defaults = createSalesDefaults("张销售");
  assert.equal(defaults.needInvoice, false);
  assert.equal(defaults.freeShipping, false);

  // Switch initial state matches:
  // "开发票" Switch checked = Boolean(defaults.needInvoice) => false
  // "运费到付" Switch checked = !defaults.freeShipping => true (到付自理)
  assert.equal(Boolean(defaults.needInvoice), false);
  assert.equal(!defaults.freeShipping, true);
});

test("toggling 开发票 switch updates needInvoice without mutating schema or payload meaning", () => {
  const values = createSalesDefaults("张销售");

  // User turns ON "开发票" switch
  const onInvoiceSwitchChange = (checked: boolean) => {
    values.needInvoice = checked;
  };

  onInvoiceSwitchChange(true);
  assert.equal(values.needInvoice, true);

  // User turns OFF "开发票" switch
  onInvoiceSwitchChange(false);
  assert.equal(values.needInvoice, false);
});

test("toggling 运费到付 switch inverts freeShipping correctly", () => {
  const values = createSalesDefaults("张销售");

  // User turns OFF "运费到付" switch (meaning free shipping / store pickup)
  const onShippingSwitchChange = (checked: boolean) => {
    values.freeShipping = !checked;
  };

  // Switch turned off (not 到付 => 包邮)
  onShippingSwitchChange(false);
  assert.equal(values.freeShipping, true);

  // Switch turned on (到付 => freeShipping is false)
  onShippingSwitchChange(true);
  assert.equal(values.freeShipping, false);
});

test("submitted payload with switches validates against salesOrderSchema", () => {
  const values = {
    ...createSalesDefaults("张销售"),
    customerId: "CUST-001",
    customerName: "张三",
    customerPartnerType: "customer" as const,
    handleBy: "张销售",
    paymentHandler: "张销售",
    items: [
      {
        inventoryId: "",
        productId: "PROD-1",
        productName: "RTX 4090",
        brand: "ASUS",
        model: "4090",
        vram: "24G",
        sellPrice: 12000,
        costPrice: 10000,
        quantity: 1,
        condition: "全新",
        aftersalesTerms: "保修一年",
        remarks: "",
      },
    ],
    // Switch states applied:
    needInvoice: true,
    freeShipping: false, // 运费到付 switch is ON => freeShipping is false
  };

  const parsed = salesOrderSchema.safeParse(values);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.needInvoice, true);
    assert.equal(parsed.data.freeShipping, false);
  }
});

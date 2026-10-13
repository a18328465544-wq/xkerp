import assert from "node:assert/strict";
import test from "node:test";
import {CORE_QUOTE_PASTE_HEADER, MAX_QUOTE_PASTE_ROWS, parseMarketQuotePaste} from "./quote.import";
import {coreQuoteProfile} from "@/src/utils/quoteReference";

test("core CSV/Excel uses complete model, prices and optional date/note without source", () => {
  const row = "rtx4070ti,3800,4300,,基准";
  for (const input of [CORE_QUOTE_PASTE_HEADER + "\n" + row, row, CORE_QUOTE_PASTE_HEADER.replaceAll(",", "\t") + "\n" + row.replaceAll(",", "\t")]) {
    const result = parseMarketQuotePaste(input);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0]?.coreModel, "RTX4070TI");
    assert.equal(result.rows[0]?.coreId, "GPU-NVIDIA-RTX4070TI");
    assert.equal(result.rows[0]?.source, "");
    assert.equal(result.rows[0]?.sellPrice, 4300);
    assert.equal(result.rows[0]?.productId, "");
    assert.deepEqual(result.rows[0]?.profile, coreQuoteProfile());
  }
});

test("old concise and full paste convert only complete GPU models without inventing source", () => {
  const result = parseMarketQuotePaste("商品型号\t品牌\t回收价\t销售价\t走势\t说明\nRTX4070ti\t华硕\t3,800\t4,300\t上涨\t基准");
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.coreModel, "RTX4070TI");
  assert.equal(result.rows[0]?.brand, "NVIDIA");
  assert.equal(result.rows[0]?.source, "");
  assert.equal(result.rows[0]?.quoteScope, "core");
  const concise = parseMarketQuotePaste("RTX4070TI,3800,4300,平稳,正常");
  assert.equal(concise.rows[0]?.source, "");
  assert.equal(concise.rows[0]?.quoteScope, "core");
  const bare = parseMarketQuotePaste("4070TI,3800,4300");
  assert.equal(bare.rows.length, 0);
  assert.match(bare.errors[0] || "", /型号待确认/);
});

test("all four complete-model case variants have the same pasted model and core id", () => {
  for (const name of ["RTX4070TI", "rtx4070ti", "RTX4070ti", "rTx4070Ti"]) {
    for (const row of [`${name},人工询价,,3800,4300,基准`, `${name},3800,4300`]) {
      const result = parseMarketQuotePaste(row);
      assert.deepEqual(result.errors, []);
      assert.equal(result.rows[0]?.model, "RTX4070TI");
      assert.equal(result.rows[0]?.coreId, "GPU-NVIDIA-RTX4070TI");
    }
  }
});

test("missing prices do not become zero and malformed amounts/date are errors", () => {
  const missing = parseMarketQuotePaste(CORE_QUOTE_PASTE_HEADER + "\nRTX4070TI,0,,,基准");
  assert.equal(missing.rows[0]?.buyPrice, 0);
  assert.equal(missing.rows[0]?.sellPrice, null);
  for (const row of ["RTX4070TI,,,,基准", "RTX4070TI,abc,4300,,基准", "RTX4070TI,3800,4300,2026-02-30,基准"]) assert.equal(parseMarketQuotePaste(CORE_QUOTE_PASTE_HEADER + "\n" + row).errors.length, 1);
  for (const row of ["RTX4070TI,,4300,,基准", "RTX4070TI,3800,,,基准"]) assert.equal(parseMarketQuotePaste(CORE_QUOTE_PASTE_HEADER + "\n" + row).errors.length, 0);
});

test("optional source in old header is accepted blank or preserved when provided", () => {
  const header = "核心型号,来源,有效期至,回收价,销售价,说明";
  for (const source of ["", "历史询价"]) {
    const result = parseMarketQuotePaste(header + `\nRTX4070TI,${source},,3800,4300,基准`);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0]?.source, source);
    assert.equal(result.rows[0]?.sellPrice, 4300);
  }
  const dated = parseMarketQuotePaste("RTX4070TI,3800,4300,2026-10-20,基准");
  assert.equal(dated.rows[0]?.validUntil, "2026-10-20");
  assert.equal(parseMarketQuotePaste("RTX4070TI,3800,4300,2026-02-30,基准").errors.length, 1);
  const oneSide = parseMarketQuotePaste("RTX4070TI,3800,,,基准,补充");
  assert.deepEqual(oneSide.errors, []);
  assert.equal(oneSide.rows[0]?.buyPrice, 3800);
  assert.equal(oneSide.rows[0]?.sellPrice, null);
  assert.equal(oneSide.rows[0]?.note, "基准，补充");
});

test("old scoped core formats remain readable without conditions; product rows are never silently converted", () => {
  const old14 = "报价范围,核心型号,商品ID,新旧,成色,质保,包装,显存,来源,有效期至,回收价,销售价,走势,说明";
  const core = parseMarketQuotePaste(old14 + "\n核心行情,RTX5090,,二手,95新,无保,无盒,24G,人工询价,,38000,43000,平稳,基准");
  assert.deepEqual(core.rows[0]?.profile, coreQuoteProfile());
  const old7 = parseMarketQuotePaste("报价范围,核心型号,来源,有效期至,回收价,销售价,说明\n核心基础价,RTX5090,人工询价,,38000,43000,基准");
  assert.equal(old7.rows[0]?.coreModel, "RTX5090");
  for (const scope of ["商品专属", "product"]) {
    const result = parseMarketQuotePaste(old14 + "\n" + scope + ",RTX5090,P-ASUS,二手,95新,在保,带盒,32G,人工询价,,38000,45000,平稳,专属");
    assert.equal(result.rows.length, 0);
    assert.match(result.errors[0] || "", /商品专属报价已停用/);
  }
});

test("paste reports partial failures and rejects excessive or malformed CSV input", () => {
  const result = parseMarketQuotePaste("RTX4070TI,3800,4300\n4070TI,3800,4300");
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(parseMarketQuotePaste(Array.from({length: MAX_QUOTE_PASTE_ROWS + 1}, () => "RTX4070TI,3800,4300").join("\n")).rows.length, 0);
  assert.equal(parseMarketQuotePaste('RTX4070TI,"不完整,3800,4300').errors.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import {productCategoryValues} from "../src/types/core.ts";
import {ValidationError} from "./errors.ts";
import {assemblyCreateDto, inventoryListQueryDto, productListQueryDto, productTemplateCreateDto, productTemplateUpdateDto, parseHttpDto} from "./httpDto.ts";

const product = {name: "测试商品", category: "显卡", brand: "测试品牌", model: "测试型号", version: "标准版", vram: "24G", refBuyPrice: 100, refSellPrice: 150};

test("HTTP category filters and product writes share the physical-product taxonomy", () => {
  for (const category of productCategoryValues) {
    assert.equal(parseHttpDto(inventoryListQueryDto, {category}).category, category);
    assert.equal(parseHttpDto(productListQueryDto, {category}).category, category);
    assert.equal(parseHttpDto(productTemplateCreateDto, {...product, category}).category, category);
  }
  for (const dto of [inventoryListQueryDto, productListQueryDto]) {
    assert.throws(() => parseHttpDto(dto, {category: "组装拆卸"}), ValidationError);
  }
  for (const dto of [productTemplateCreateDto, productTemplateUpdateDto]) {
    assert.throws(() => parseHttpDto(dto, {...product, category: "组装拆卸"}), ValidationError);
  }
});

test("assembly commands keep operation types separate from resulting product categories", () => {
  const assembly = {type: "组装", handler: "测试员", beforeParts: [], afterParts: [], afterSn: "PC-1", afterProductName: "组装电脑", afterCategory: "整机"};
  assert.equal(parseHttpDto(assemblyCreateDto, assembly).afterCategory, "整机");
  assert.throws(() => parseHttpDto(assemblyCreateDto, {...assembly, afterCategory: "组装拆卸"}), ValidationError);
  const part = {partName: "拆出的显卡", category: "显卡", sn: "GPU-1"};
  const disassembly = {type: "拆卸", handler: "测试员", beforeSn: "PC-1", beforeParts: [], afterParts: [part]};
  assert.equal(parseHttpDto(assemblyCreateDto, disassembly).afterParts[0]?.category, "显卡");
  assert.throws(() => parseHttpDto(assemblyCreateDto, {...disassembly, afterParts: [{...part, category: "组装拆卸"}]}), ValidationError);
  assert.equal(parseHttpDto(inventoryListQueryDto, {status: "已组装"}).status, "已组装");
  assert.equal(parseHttpDto(inventoryListQueryDto, {status: "已拆卸"}).status, "已拆卸");
});

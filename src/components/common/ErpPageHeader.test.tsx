import assert from "node:assert/strict";
import test from "node:test";
import {RefreshCw} from "lucide-react";
import {Button} from "@/src/components/ui";
import {isRefreshAction, resolveDesktopPageActions, resolvePhonePageActions} from "./ErpPageHeader";

test("phone action presentation retains all actions across fragments and wrappers", () => {
  const actions = resolvePhonePageActions(<><Button>刷新</Button><div><Button variant="primary">新增</Button><Button disabled>导出</Button></div></>);
  assert.equal(actions.length, 3);
  assert.equal(resolvePhonePageActions(undefined).length, 0);
});

test("isRefreshAction detects refresh buttons to suppress them on phone", () => {
  assert.equal(isRefreshAction(<Button><RefreshCw />刷新</Button>), true);
  assert.equal(isRefreshAction(<Button aria-label="刷新页面"><RefreshCw /></Button>), true);
  assert.equal(isRefreshAction(<Button data-erp-action="refresh">重新加载</Button>), true);
  assert.equal(isRefreshAction(<Button variant="primary">新建单据</Button>), false);
  assert.equal(isRefreshAction(<Button variant="secondary">导出数据</Button>), false);
  assert.equal(isRefreshAction(null), false);
});

test("desktop keeps a primary and export while preserving all other action props", () => {
  const handler = () => undefined;
  const refresh = <Button onClick={handler}>刷新</Button>;
  const remove = <Button variant="danger" disabled onClick={handler}>作废</Button>;
  const result = resolveDesktopPageActions(<>{refresh}<Button variant="primary">新增</Button><Button>导出结果</Button>{remove}</>);
  assert.equal(result.inline.length, 2);
  assert.equal(result.more.length, 2);
  assert.equal((result.more[0] as typeof refresh).props.onClick, handler);
  assert.equal((result.more[1] as typeof remove).props.disabled, true);
});

test("desktop keeps view switches and other non-button controls visible", () => {
  function ViewSwitch() { return <div role="radiogroup">单卡 / 型号</div>; }
  const result = resolveDesktopPageActions(<><ViewSwitch /><Button>刷新</Button></>);
  assert.equal(result.inline.length, 1);
  assert.equal(result.more.length, 1);
});

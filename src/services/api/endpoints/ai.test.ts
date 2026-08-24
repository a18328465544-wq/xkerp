import assert from "node:assert/strict";
import test from "node:test";
import {aiApi, parseCopilotSseBuffer} from "./ai";

const context = {currentTab: "inventory", currentTabLabel: "单卡/SN库存", currentUser: "测试账号"};

test("Copilot SSE parser keeps incomplete frames and adapts valid events", () => {
  const first = parseCopilotSseBuffer('data: {"type":"text_delta","text":"库存"}\n\ndata: {"type":"done","source":"rules"}\n\npartial');
  assert.equal(first.events.length, 2);
  assert.deepEqual(first.events[0], {type: "text_delta", text: "库存"});
  assert.deepEqual(first.events[1], {type: "done", source: "rules", model: undefined});
  assert.equal(first.rest, "partial");
  const second = parseCopilotSseBuffer(`${first.rest} frame\n\n`);
  assert.deepEqual(second.events, []);
});

test("Copilot stream uses the shared API client contract and yields tool results", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{input: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({input: String(input), init});
    return new Response([
      'data: {"type":"tool_result","result":{"id":"result-1","toolName":"searchInventory","type":"inventory","title":"库存检索结果","rows":[{"productName":"RTX 4090","storageDays":48}]}}\n\n',
      'data: {"type":"done","source":"rules"}\n\n',
    ].join(""), {status: 200, headers: {"Content-Type": "text/event-stream"}});
  };
  try {
    const events: string[] = [];
    await aiApi.streamCopilot({messages: [{role: "user", content: "查看库存"}], context}, (event) => events.push(event.type));
    assert.deepEqual(events, ["tool_result", "done"]);
    assert.equal(requests[0]?.input, "/api/ai/copilot");
    assert.equal(requests[0]?.init?.credentials, "same-origin");
    assert.equal(new Headers(requests[0]?.init?.headers).get("Accept"), "text/event-stream");
    assert.equal(JSON.parse(String(requests[0]?.init?.body)).context.currentTab, "inventory");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

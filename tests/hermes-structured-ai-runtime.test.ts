import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStrictJsonResponse,
  StructuredAiRuntimeError
} from "../src/adapters/ai/hermes-structured-ai-runtime.js";

test("Hermes parser accepts standalone and fenced JSON", () => {
  assert.deepEqual(parseStrictJsonResponse('{"ok":true,"items":[1,2]}'), {
    ok: true,
    items: [1, 2]
  });
  const fence = String.fromCharCode(96).repeat(3);
  assert.deepEqual(
    parseStrictJsonResponse(fence + 'json\n{"ok":true}\n' + fence),
    { ok: true }
  );
});

test("Hermes parser tolerates transport prose around exactly one complete JSON value", () => {
  const text =
    "Hermes Agent v0.21.3\n生成完成，结果如下：\n" +
    '{"title":"创意","note":"字符串里允许 {花括号} 和 [方括号]","nested":{"a":[1,2]}}' +
    "\nDone.";
  assert.deepEqual(parseStrictJsonResponse(text), {
    title: "创意",
    note: "字符串里允许 {花括号} 和 [方括号]",
    nested: { a: [1, 2] }
  });
});

test("Hermes parser ignores balanced non-JSON log fragments before the unique JSON result", () => {
  const text = '[INFO]\nstatus={not-json}\nOUTPUT:\n{"ok":true}';
  assert.deepEqual(parseStrictJsonResponse(text), { ok: true });
});

test("Hermes parser fails closed when stdout contains more than one JSON value", () => {
  assert.throws(
    () => parseStrictJsonResponse('{"progress":1}\n{"result":"final"}'),
    (error: unknown) =>
      error instanceof StructuredAiRuntimeError &&
      /多个 JSON/.test(error.message)
  );
});

test("Hermes parser fails closed on truncated or non-JSON output", () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const text of ['{"broken":', "Hermes says hello", fence + 'json\n{"x":1\n' + fence]) {
    assert.throws(
      () => parseStrictJsonResponse(text),
      (error: unknown) =>
        error instanceof StructuredAiRuntimeError &&
        /不是唯一且完整的 JSON/.test(error.message)
    );
  }
});

test("Hermes parser strips ANSI transport color before parsing", () => {
  assert.deepEqual(
    parseStrictJsonResponse("\u001b[32mRESULT\u001b[0m\n{\"ok\":true}"),
    { ok: true }
  );
});

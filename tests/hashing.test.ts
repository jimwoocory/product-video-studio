import test from "node:test";
import assert from "node:assert/strict";
import { hashValue, stableStringify } from "../src/domain/hashing.js";

test("canonical serialization is stable across object key order", () => {
  const left = { b: 2, a: { d: 4, c: 3 } };
  const right = { a: { c: 3, d: 4 }, b: 2 };
  const expectedJson = '{"a":{"c":3,"d":4},"b":2}';
  const expectedHash = "c461c47a913352f1a21e3f2ea49e1fd34754c0dc12cb7366e4636d5e186c6c6e";
  assert.equal(stableStringify(left), expectedJson);
  assert.equal(stableStringify(right), expectedJson);
  assert.equal(hashValue(left), expectedHash);
  assert.equal(hashValue(right), expectedHash);
});

import { HermesStructuredAiRuntime } from "../dist/src/adapters/ai/hermes-structured-ai-runtime.js";

const runtime = new HermesStructuredAiRuntime(process.cwd());
const result = await runtime.generateJson({
  task: "Connectivity check.",
  instructions: "Return exactly an object with ok=true and runtime=hermes.",
  input: { ping: true },
  outputContract: { ok: true, runtime: "hermes" }
});

if (!result || typeof result !== "object" || result.ok !== true || result.runtime !== "hermes") {
  throw new Error("Unexpected Hermes structured result: " + JSON.stringify(result));
}
console.log(JSON.stringify({ hermesStructuredJson: "PASS", result }));

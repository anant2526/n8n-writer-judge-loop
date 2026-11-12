// Offline checks: workflow wiring + Parse Judge logic + loop/circuit-breaker behaviour.
// Usage: node scripts/test-workflow.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const wf = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "workflows", "writer-judge-loop.json"), "utf8")
);
const names = new Set(wf.nodes.map((n) => n.name));

// 1. Every connection points at a real node
for (const [from, outs] of Object.entries(wf.connections)) {
  assert(names.has(from), `unknown source node ${from}`);
  for (const branch of Object.values(outs))
    for (const targets of branch)
      for (const t of targets) assert(names.has(t.node), `unknown target ${t.node}`);
}
// 2. Loop exists: Pass? false branch -> Writer Agent
assert.strictEqual(wf.connections["Pass?"].main[1][0].node, "Writer Agent");
assert.strictEqual(wf.connections["Pass?"].main[0][0].node, "Final Result");
console.log("✔ wiring ok (", wf.nodes.length, "nodes, loop present )");

// 3. Run the Parse Judge code with mocked n8n globals
const code = wf.nodes.find((n) => n.name === "Parse Judge").parameters.jsCode;
function runParse(judgeText, runIndex) {
  const $input = { first: () => ({ json: { text: judgeText } }) };
  const $ = (n) => ({
    first: () => ({ json: n === "Task" ? { task: "T" } : { text: "DRAFT" } }),
  });
  return new Function("$input", "$", "$runIndex", code)($input, $, runIndex)[0].json;
}

let r = runParse('```json\n{"accuracy":9,"clarity":8,"conciseness":7,"feedback":"ok"}\n```', 0);
assert.deepStrictEqual(r, { task: "T", draft: "DRAFT", feedback: "ok", score: 8, attempt: 1 });
r = runParse("not json at all", 2);
assert.strictEqual(r.score, 0);
assert.strictEqual(r.attempt, 3);
assert.strictEqual(r.feedback, "Judge returned invalid JSON");
console.log("✔ parse-judge ok (markdown-wrapped JSON + invalid JSON fallback)");

// 4. Simulate the loop with the Pass? rule
const pass = (s) => s.score >= 8 || s.attempt >= 3;
function simulate(scores) {
  for (let i = 0; ; i++) {
    const s = { score: scores[Math.min(i, scores.length - 1)], attempt: i + 1 };
    if (pass(s)) return s;
  }
}
assert.deepStrictEqual(simulate([6, 8.3]), { score: 8.3, attempt: 2 });
assert.deepStrictEqual(simulate([3]), { score: 3, attempt: 3 }); // circuit breaker
console.log("✔ loop stops on score >= 8, and at 3 attempts otherwise");

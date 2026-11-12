// Generates workflows/writer-judge-loop.json (importable into n8n).
// Usage: node scripts/build-workflow.js
const fs = require("fs");
const path = require("path");

const parseJudge = fs
  .readFileSync(path.join(__dirname, "parse-judge.js"), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("//"))
  .join("\n")
  .trim();

const WRITER_PROMPT = `=Task: {{ $json.task }}
{{ $json.feedback
  ? "Your previous draft:\\n" + $json.draft
    + "\\n\\nJudge feedback: " + $json.feedback
    + "\\n\\nRewrite the draft to fix the feedback."
  : "Write the first draft." }}`;

const JUDGE_PROMPT = `=Task given to the writer: {{ $('Task').first().json.task }}

Draft to evaluate:
{{ $json.text }}

Score each criterion from 1 to 10:
- accuracy: the facts are correct
- clarity: a first-year student can follow it
- conciseness: about 100 words, no filler

Return ONLY this JSON:
{"accuracy": 0, "clarity": 0, "conciseness": 0,
 "feedback": "one specific sentence on what to improve"}`;

const str = (id, name, value) => ({ id, name, value, type: "string" });

const nodes = [
  {
    id: "a1b2c3d4-0001-4000-8000-000000000001",
    name: "Manual Trigger",
    type: "n8n-nodes-base.manualTrigger",
    typeVersion: 1,
    position: [0, 300],
    parameters: {},
  },
  {
    id: "a1b2c3d4-0002-4000-8000-000000000002",
    name: "Task",
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [220, 300],
    parameters: {
      assignments: {
        assignments: [
          str("f-task", "task",
            "Explain what a vector database is to a first-year engineering student in about 100 words."),
          str("f-draft", "draft", ""),
          str("f-feedback", "feedback", ""),
        ],
      },
      options: {},
    },
  },
  {
    id: "a1b2c3d4-0003-4000-8000-000000000003",
    name: "Writer Agent",
    type: "@n8n/n8n-nodes-langchain.chainLlm",
    typeVersion: 1.5,
    position: [460, 300],
    parameters: {
      promptType: "define",
      text: WRITER_PROMPT,
      messages: {
        messageValues: [
          { message: "You are a Writer agent. Output only the final text, no preamble." },
        ],
      },
    },
  },
  {
    id: "a1b2c3d4-0004-4000-8000-000000000004",
    name: "Groq Chat Model",
    type: "@n8n/n8n-nodes-langchain.lmChatGroq",
    typeVersion: 1,
    position: [460, 520],
    parameters: { model: "llama-3.1-8b-instant", options: { temperature: 0.7 } },
    credentials: { groqApi: { id: "", name: "Groq account" } },
  },
  {
    id: "a1b2c3d4-0005-4000-8000-000000000005",
    name: "Judge Agent",
    type: "@n8n/n8n-nodes-langchain.chainLlm",
    typeVersion: 1.5,
    position: [800, 300],
    parameters: {
      promptType: "define",
      text: JUDGE_PROMPT,
      messages: {
        messageValues: [
          { message: "You are a strict evaluator. Reply with JSON only, no markdown." },
        ],
      },
    },
  },
  {
    id: "a1b2c3d4-0006-4000-8000-000000000006",
    name: "OpenRouter Chat Model",
    type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
    typeVersion: 1,
    position: [800, 520],
    parameters: { model: "google/gemma-3-27b-it:free", options: { temperature: 0 } },
    credentials: { openRouterApi: { id: "", name: "OpenRouter account" } },
  },
  {
    id: "a1b2c3d4-0007-4000-8000-000000000007",
    name: "Parse Judge",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1120, 300],
    parameters: { mode: "runOnceForAllItems", jsCode: parseJudge },
  },
  {
    id: "a1b2c3d4-0008-4000-8000-000000000008",
    name: "Pass?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1340, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: "c-pass",
            leftValue: "={{ $json.score >= 8 || $json.attempt >= 3 }}",
            rightValue: "",
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      looseTypeValidation: true,
      options: {},
    },
  },
  {
    id: "a1b2c3d4-0009-4000-8000-000000000009",
    name: "Final Result",
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position: [1580, 200],
    parameters: {
      assignments: {
        assignments: [
          str("r-text", "final_text", "={{ $json.draft }}"),
          { id: "r-score", name: "judge_score", value: "={{ $json.score }}", type: "number" },
          { id: "r-att", name: "attempts", value: "={{ $json.attempt }}", type: "number" },
        ],
      },
      options: {},
    },
  },
  {
    id: "a1b2c3d4-0010-4000-8000-000000000010",
    name: "Sticky Note",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [1300, 480],
    parameters: {
      width: 380,
      height: 160,
      content:
        "## Circuit breaker\n`attempt >= 3` stops runaway loops. Without it a harsh judge can loop forever and burn API quota.\n\nFalse branch → back into **Writer Agent** with the judge's feedback.",
    },
  },
];

const main = (node) => ({ node, type: "main", index: 0 });
const connections = {
  "Manual Trigger": { main: [[main("Task")]] },
  Task: { main: [[main("Writer Agent")]] },
  "Writer Agent": { main: [[main("Judge Agent")]] },
  "Groq Chat Model": { ai_languageModel: [[{ node: "Writer Agent", type: "ai_languageModel", index: 0 }]] },
  "Judge Agent": { main: [[main("Parse Judge")]] },
  "OpenRouter Chat Model": { ai_languageModel: [[{ node: "Judge Agent", type: "ai_languageModel", index: 0 }]] },
  "Parse Judge": { main: [[main("Pass?")]] },
  // output 0 = true (pass) → Final Result; output 1 = false → loop back to Writer
  "Pass?": { main: [[main("Final Result")], [main("Writer Agent")]] },
};

const workflow = {
  name: "Writer-Judge Loop",
  nodes,
  connections,
  pinData: {},
  settings: { executionOrder: "v1" },
  active: false,
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const out = path.join(__dirname, "..", "workflows", "writer-judge-loop.json");
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + "\n");
console.log("Wrote", out);

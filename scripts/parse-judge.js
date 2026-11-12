// Parse Judge — n8n Code node (Mode: "Run Once for All Items", JavaScript)
// Turns the Judge Agent's raw text into a numeric score + feedback,
// and carries task/draft forward so the Writer can rewrite on a loop.

const raw = $input.first().json.text;
let j;
try {
  j = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
} catch (e) {
  j = { accuracy: 0, clarity: 0, conciseness: 0,
        feedback: "Judge returned invalid JSON" };
}

const score = Math.round(
  (Number(j.accuracy) + Number(j.clarity) + Number(j.conciseness)) / 3 * 10) / 10;

return [{ json: {
  task: $('Task').first().json.task,
  draft: $('Writer Agent').first().json.text,
  feedback: j.feedback,
  score: score,
  attempt: $runIndex + 1
}}];

# Writer–Judge Loop · Multi-Agent n8n Workflow with LLM-as-a-Judge

A **Writer** agent (Groq · `llama-3.1-8b-instant`) drafts text. A separate **Judge** agent (OpenRouter · a different model family) scores the draft on a rubric. If the average score is below **8/10**, the Judge's feedback is sent back to the Writer for a rewrite, up to **3 attempts**.

```
Manual Trigger → Task → Writer Agent (Groq) → Judge Agent (OpenRouter) → Parse Judge → Pass?
                              ▲                                                         │
                              └──────────── false: feedback + previous draft ───────────┤
                                                                                        └─ true → Final Result
```

## Why it's built this way

- **Two providers.** A model tends to rate its own writing too kindly (self-preference bias). Using Llama for the Writer and a different family (Gemma by default) for the Judge gives fairer scores.
- **Judge at temperature 0.** This keeps scoring consistent from run to run.
- **Circuit breaker.** `attempt >= 3` stops runaway loops, so a harsh judge can't burn through your API quota.

## Repo layout

| Path | What it is |
|---|---|
| `docker-compose.yml` | Runs n8n on `localhost:5678`, with `host.docker.internal` mapped so the container can reach Ollama |
| `workflows/writer-judge-loop.json` | Importable n8n workflow (the whole lab, already wired) |
| `scripts/parse-judge.js` | Code for the *Parse Judge* node (JSON extraction + average score) |
| `scripts/build-workflow.js` | Regenerates the workflow JSON from source |
| `scripts/test-workflow.js` | Offline tests for wiring, parser and loop logic |
| `docs/results.md` | Results table for Step 5 |

## Quick start

**Prerequisites:** Docker Desktop, Ollama (optional fallback), a [Groq API key](https://console.groq.com/keys) and an [OpenRouter API key](https://openrouter.ai/keys).

```bash
git clone https://github.com/anant2526/n8n-writer-judge-loop.git
cd n8n-writer-judge-loop
docker compose up -d          # then open http://localhost:5678 and create the owner account
curl http://localhost:11434   # optional: should print "Ollama is running"
```

1. **Credentials:** In n8n, go to **Credentials → Create**, then add a *Groq* credential and an *OpenRouter* credential.
2. **Import:** Go to **Workflows → Import from File** and select `workflows/writer-judge-loop.json`.
3. Open **Groq Chat Model** and **OpenRouter Chat Model**, then select your credentials in each.
4. Click **Execute workflow**. Open each node to follow the cycle: draft → score → feedback → rewrite.

> The default Judge model is `google/gemma-3-27b-it:free`. If OpenRouter returns *"no endpoints found"*, pick another free model (IDs end in `:free`) from [openrouter.ai/models](https://openrouter.ai/models). Choose one that isn't a Llama model.

## Node-by-node

| Node | Type | Key settings |
|---|---|---|
| Task | Edit Fields (Set) | `task`, `draft` = "", `feedback` = "" |
| Writer Agent | Basic LLM Chain | System: *"You are a Writer agent. Output only the final text, no preamble."* The prompt switches between first draft and rewrite depending on whether `feedback` is set |
| Groq Chat Model | Groq | `llama-3.1-8b-instant`, temperature 0.7 |
| Judge Agent | Basic LLM Chain | System: *"You are a strict evaluator. Reply with JSON only, no markdown."* Scores accuracy, clarity and conciseness from 1 to 10 |
| OpenRouter Chat Model | OpenRouter | free non-Llama model, temperature 0 |
| Parse Judge | Code (run once for all items) | Extracts the JSON, averages the 3 scores, sets `attempt = $runIndex + 1` |
| Pass? | If | `{{ $json.score >= 8 \|\| $json.attempt >= 3 }}` is true |
| Final Result | Edit Fields (Set) | `final_text`, `judge_score`, `attempts` |

## Tests

```bash
node scripts/build-workflow.js   # regenerate JSON after editing parse-judge.js
node scripts/test-workflow.js
```

These run without n8n or API keys. They check that every connection points at a real node and that the loop edge exists. They also check that the parser handles markdown-wrapped JSON and falls back on invalid JSON, and that the loop stops at a score of 8 or after 3 attempts.

## Experiments (Step 5)

1. Run the default task ("vector database", about 100 words).
2. Try a harder task, such as *"Explain how a transformer works in exactly 50 words"*.
3. Raise the pass mark to `>= 10` and confirm the loop stops at 3 attempts.
4. Switch the Judge to the same Groq model as the Writer and check whether the scores go up.

Record the results in [`docs/results.md`](docs/results.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `localhost:5678` won't open | `docker compose ps` / `docker compose logs n8n`; make sure nothing else is using port 5678 |
| Ollama "connection refused" | Use `http://host.docker.internal:11434`, not `localhost`. Run `ollama serve` |
| Groq 429 (rate limit) | Wait about a minute, or switch the Writer to Ollama `llama3.2` |
| OpenRouter 404 / "no endpoints found" | The free model ID is wrong or unavailable, so pick another |
| Score always 0 / "invalid JSON" | Judge temperature must be 0 and the "JSON only" instruction must stay. Check the Judge node's output text |
| Code node shows no data | Run the earlier nodes first (Execute workflow), then re-run the Code node |

## Stretch ideas

- **Panel of judges:** add a second Judge on another model and average the two scores.
- **Fact-checker agent:** add an Ollama node that flags claims before the Judge scores them.
- **Logging:** write task, score and attempts to an n8n Data table or Google Sheet so you can compare runs.

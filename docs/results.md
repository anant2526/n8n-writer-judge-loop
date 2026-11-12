# Step 5 · Results

Fill this table in after running each experiment in n8n.

| Run / task | Attempts | Final score | Did the rewrite improve the draft? Why? |
|---|---|---|---|
| 1. Vector database (~100 words) | | | |
| 2. Harder task (transformer in exactly 50 words) | | | |
| 3. Same-model judge (Groq judging Groq) | | | |

## Pass mark raised to `>= 10`

- Loop stopped at attempt: ___
- Observation:

## Reflection

- Did the self-judging run (Groq judging Groq) give higher scores than the cross-family judge?
- Which rubric criterion did the Writer find hardest to fix?

## Done checklist

- [ ] n8n runs from Docker Compose
- [ ] Writer (Groq) and Judge (OpenRouter) both return output
- [ ] Loop retries on a low score
- [ ] Stops after 3 attempts
- [ ] Results table filled in

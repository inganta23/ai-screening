const { Mistral } = require("@mistralai/mistralai");

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const MODEL = process.env.MISTRALAI_MODEL || "devstral-medium-latest";
const TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.25");
const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || "3", 10);
const RETRY_BACKOFF = [500, 1500, 4000];

async function callLLM(systemPrompt, userPrompt) {
  console.log("Call LLM");
  const completion = await client.chat.complete({
    model: MODEL,
    temperature: TEMPERATURE,
    top_p: 1.0,
    max_tokens: 1000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || "";
  return content;
}

async function callWithRetries(systemPrompt, userPrompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[Mistral] Waiting ${delay}ms before retry ${attempt}`);
        await wait(delay);
      }

      const raw = await callLLM(systemPrompt, userPrompt);
      const parsed = safeParseJSON(raw);

      if (parsed) return parsed;

      if (attempt < MAX_RETRIES) {
        console.warn(
          `[LLM] Attempt ${attempt}: invalid JSON, retrying after ${
            RETRY_BACKOFF[attempt - 1] || 2000
          }ms`
        );
        await wait(RETRY_BACKOFF[attempt - 1] || 2000);
      } else {
        throw new Error("LLM returned invalid JSON after retries");
      }
    } catch (err) {
      if (err.status === 429) {
        console.warn(`[Mistral] Rate limit hit on attempt ${attempt}`);
      }

      if (attempt === MAX_RETRIES) {
        console.error("[LLM] Failed after max retries:", err.message);
        throw err;
      }
      console.warn(`[LLM] Retry ${attempt} after error: ${err.message}`);
      await wait(RETRY_BACKOFF[attempt - 1] || 2000);
    }
  }
}

function safeParseJSON(content) {
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (e) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  callLLM,
  callWithRetries,
  safeParseJSON,
};

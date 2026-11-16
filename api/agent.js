// Serverless function (Vercel, Node 18+): POST /api/agent  -> respons streaming (SSE) dari Gemini atau Groq
// Provider dipilih lewat body.provider: "gemini" (default) atau "groq".
// Kunci dibaca dari Environment Variable (tidak pernah dikirim ke browser):
//   Gemini -> "API"       Groq -> "GROQ_API"
// Opsional: "GROQ_MODEL" untuk mengganti model Groq tanpa mengubah kode.
const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"; // model terkuat Groq dgn structured output strict
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const COMMON = `You are the built-in code-generation engine of "VynWatch Creator", an admin tool that builds store packages for the VynWatch smartwatch (ESP32-S3, 128x64 monochrome OLED).
Hard rules:
- Output ONLY the JSON object that matches the response schema. No greetings, explanations, questions, notes, summaries, markdown or code fences, neither inside any field nor outside the JSON. Never converse: even if the request is vague or conversational, pick the most reasonable interpretation and produce the complete resource.
- Generate EVERY field of the schema, all non-empty and final. The package is assembled automatically from these fields, so nothing may be omitted, abbreviated, deferred or left as a placeholder.
- Write fields in the order of the schema. "name" and "description" use the same language as the user's request.
- The REFERENCE GUIDE at the end of this instruction is the single source of truth. Use only what it documents; never invent commands, functions or parameters.
- If "[Current editor content]" is supplied and the user wants a change to it, modify it and return the full result; if the user wants something new, ignore it.
- If you receive automatic validation errors, fix every one of them and return the complete corrected output.
- "name" max 32 chars. "id" is unique, 1-24 chars of A-Z a-z 0-9 _ - (e.g. snake_case with a numeric suffix). "version" max 12 chars (default "1.0.0"). "description" max 120 chars.`;

const SYS = {
  app: `${COMMON}

CURRENT TARGET: an APPLICATION or GAME written in Lua 5.4 for the VynWatch sandbox.
- "type" is "game" for games and "app" for everything else.
- "thumbnail" is a 16x16 1-bit icon as exactly 64 hexadecimal digits (32 bytes): 16 rows, 2 bytes per row, MSB-first (the leftmost pixel is the highest bit). Design a simple, recognizable icon for the program.
- "code" is the complete, runnable Lua program (max 16 KiB UTF-8), using only the VynWatch API from the guide and following the entry-point conventions the guide requires.`,
  face: `${COMMON}

CURRENT TARGET: a WATCH FACE written in the VynWatch watch face DSL.
- "tag" is exactly one of: Digital, Analog, Hybrid, Info, Unik.
- "dsl" is plain DSL text, one command per line (max 72 commands and 1500 bytes in total), using only the commands and parameter ranges from the guide. Label text is max 13 printable ASCII characters and must not contain commas, semicolons or "|". The screen is 128x64 pixels; keep everything inside it. Always include something that shows the time.`
};

const S = { type: "STRING" };
const SCHEMA = {
  app: { type: "OBJECT", propertyOrdering: ["name", "id", "version", "description", "type", "thumbnail", "code"],
    required: ["name", "id", "version", "description", "type", "thumbnail", "code"],
    properties: { name: S, id: S, version: S, description: S, type: { type: "STRING", enum: ["app", "game"] }, thumbnail: S, code: S } },
  face: { type: "OBJECT", propertyOrdering: ["name", "id", "version", "description", "tag", "dsl"],
    required: ["name", "id", "version", "description", "tag", "dsl"],
    properties: { name: S, id: S, version: S, description: S, tag: { type: "STRING", enum: ["Digital", "Analog", "Hybrid", "Info", "Unik"] }, dsl: S } }
};

// Versi JSON Schema standar untuk Groq (strict: semua field required, additionalProperties false)
const JS = { type: "string" };
const JSON_SCHEMA = {
  app: { type: "object", additionalProperties: false,
    required: ["name", "id", "version", "description", "type", "thumbnail", "code"],
    properties: { name: JS, id: JS, version: JS, description: JS, type: { type: "string", enum: ["app", "game"] }, thumbnail: JS, code: JS } },
  face: { type: "object", additionalProperties: false,
    required: ["name", "id", "version", "description", "tag", "dsl"],
    properties: { name: JS, id: JS, version: JS, description: JS, tag: { type: "string", enum: ["Digital", "Analog", "Hybrid", "Info", "Unik"] }, dsl: JS } }
};

// ---------- Streaming ----------
// Ke browser dikirim SSE yang sudah seragam untuk kedua provider:
//   data: {"t":"potongan teks JSON"}   ... berulang
//   data: {"done":true}                 selesai
//   data: {"error":"pesan"}             galat di tengah jalan
// Browser menggabungkan potongan "t" lalu mem-parse JSON parsial itu per field.
const fail = (res, msg, code = 502) => res.status(code).json({ error: msg });

function openStream(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  return { send: o => res.write(`data: ${JSON.stringify(o)}\n\n`), end: () => res.end() };
}

// Membaca SSE dari upstream, menghasilkan isi tiap event "data:"
async function* sseData(body) {
  const rd = body.getReader(), dec = new TextDecoder();
  let buf = "";
  const take = blk => blk.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("");
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let m;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const d = take(buf.slice(0, m.index)); buf = buf.slice(m.index + m[0].length);
      if (d) yield d;
    }
  }
  const d = take(buf); if (d) yield d;
}

const guideText = (mode, guide) => `${SYS[mode]}\n\n=== REFERENCE GUIDE (authoritative) ===\n${guide}`;

async function callGemini(res, { mode, guide, messages }, signal) {
  const key = process.env.API;
  if (!key) return fail(res, "Environment variable API (Gemini) belum diatur di server.", 500);
  const contents = messages.map(m => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.text || "").slice(0, 60000) }] }));
  const r = await fetch(`${GEMINI_URL.replace(":generateContent", ":streamGenerateContent")}?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: guideText(mode, guide) }] },
      contents,
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA[mode], temperature: 0.4 }
    })
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); return fail(res, d?.error?.message || `Gemini HTTP ${r.status}`); }
  const out = openStream(res);
  let got = false, finish = "";
  for await (const data of sseData(r.body)) {
    let j; try { j = JSON.parse(data); } catch { continue; }
    if (j.error) { out.send({ error: j.error.message || "Galat dari Gemini." }); return out.end(); }
    if (j.promptFeedback?.blockReason) { out.send({ error: "Permintaan diblokir AI: " + j.promptFeedback.blockReason }); return out.end(); }
    const cand = j.candidates?.[0];
    const t = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("");
    if (t) { got = true; out.send({ t }); }
    if (cand?.finishReason) finish = cand.finishReason;
  }
  if (finish === "MAX_TOKENS") out.send({ error: "Respons AI terpotong (melewati batas panjang). Coba permintaan yang lebih ringkas." });
  else if (!got) out.send({ error: "Respons AI kosong" + (finish ? ` (${finish})` : "") + ". Coba kirim ulang." });
  else out.send({ done: true });
  out.end();
}

async function callGroq(res, { mode, guide, messages }, signal) {
  const key = process.env.GROQ_API;
  if (!key) return fail(res, "Environment variable GROQ_API belum diatur di server.", 500);
  // Instruksi bentuk JSON ditambahkan ke prompt, karena mode json_object/tanpa format tidak membawa schema.
  const shape = `\n\nOUTPUT FORMAT: return a single JSON object with exactly these keys, in this order: ${JSON_SCHEMA[mode].required.join(", ")}. Every value is a string` +
    (mode === "app" ? ' ("type" is "app" or "game").' : ' ("tag" is one of Digital, Analog, Hybrid, Info, Unik).');
  const chat = [
    { role: "system", content: guideText(mode, guide) + shape },
    ...messages.map(m => ({ role: m.role === "model" ? "assistant" : "user", content: String(m.text || "").slice(0, 60000) }))
  ];
  // Dokumentasi Groq: structured output strict belum mendukung streaming. Coba berurutan, turun satu tingkat bila ditolak (HTTP 400).
  const formats = [
    { type: "json_schema", json_schema: { name: `vynwatch_${mode}`, strict: true, schema: JSON_SCHEMA[mode] } },
    { type: "json_object" },
    null
  ];
  let r, err = "";
  for (const fmt of formats) {
    r = await fetch(GROQ_URL, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL, messages: chat, stream: true, temperature: 0.4,
        reasoning_effort: "medium",     // gpt-oss: low | medium | high
        max_completion_tokens: 32768,   // sudah termasuk token reasoning
        ...(fmt ? { response_format: fmt } : {})
      })
    });
    if (r.ok) break;
    const d = await r.json().catch(() => ({}));
    err = d?.error?.message || `Groq HTTP ${r.status}`;
    if (r.status !== 400) return fail(res, err);
  }
  if (!r.ok) return fail(res, err);
  const out = openStream(res);
  let got = false, finish = "";
  for await (const data of sseData(r.body)) {
    if (data === "[DONE]") break;
    let j; try { j = JSON.parse(data); } catch { continue; }
    if (j.error) { out.send({ error: j.error.message || "Galat dari Groq." }); return out.end(); }
    const ch = j.choices?.[0];
    const t = ch?.delta?.content || "";               // reasoning (delta.reasoning) sengaja tidak diteruskan
    if (t) { got = true; out.send({ t }); }
    if (ch?.finish_reason) finish = ch.finish_reason;
  }
  if (finish === "length") out.send({ error: "Respons AI terpotong (melewati batas panjang). Coba permintaan yang lebih ringkas." });
  else if (!got) out.send({ error: "Respons AI kosong" + (finish ? ` (${finish})` : "") + ". Coba kirim ulang." });
  else out.send({ done: true });
  out.end();
}

const PROVIDERS = { gemini: callGemini, groq: callGroq };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const { mode, guide, messages, provider = "gemini" } = req.body || {};
  if (!SYS[mode]) return res.status(400).json({ error: "mode harus 'app' atau 'face'." });
  if (!PROVIDERS[provider]) return res.status(400).json({ error: "provider harus 'gemini' atau 'groq'." });
  if (typeof guide !== "string" || guide.length > 400000) return res.status(400).json({ error: "Panduan tidak valid atau terlalu besar." });
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) return res.status(400).json({ error: "messages tidak valid." });
  const ac = new AbortController();
  res.on("close", () => ac.abort());   // browser menekan "Hentikan" -> putus ke provider juga
  try {
    return await PROVIDERS[provider](res, { mode, guide, messages }, ac.signal);
  } catch (e) {
    if (ac.signal.aborted) return res.end();
    const msg = "Gagal memanggil AI: " + e.message;
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ error: msg })}\n\n`); return res.end(); }
    return fail(res, msg);
  }
};

// Respons di-stream; tetap beri batas waktu fungsi yang cukup (diabaikan bila paket Vercel membatasi lebih rendah).
module.exports.config = { maxDuration: 60 };

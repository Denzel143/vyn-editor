// Serverless function (Vercel, Node 18+): POST /api/agent
// Kunci Gemini dibaca dari Environment Variable bernama "API" (tidak pernah dikirim ke browser).
const MODEL = "gemini-flash-lite-latest";
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const COMMON = `You are the built-in code-generation agent of "VynWatch Creator", an admin tool that builds store packages for the VynWatch smartwatch (ESP32-S3, 128x64 monochrome OLED).
Rules that always apply:
- The REFERENCE GUIDE at the end of this instruction is the single source of truth. Use only what it documents; never invent commands, functions or parameters. If something is not in the guide, do not use it.
- Respond ONLY with JSON that matches the response schema. Never put markdown fences or commentary inside any field.
- "reply" is a short message to the user, written in the same language the user wrote in. Summarize what you built or ask what is missing.
- If the user asks for something to be built or changed, set "ready" to true and fill EVERY field with a complete, final value (not a diff, not a placeholder). If the request is only a question or too vague to build, set "ready" to false and answer or ask in "reply" and leave the other fields empty.
- If "[Current editor content]" is supplied and the user wants a change, modify that content and return the full result; if the user wants something new, ignore it.
- If you receive automatic validation errors, fix every one of them and return the complete corrected output.
- "id" is unique, 1-24 chars of A-Z a-z 0-9 _ - (e.g. snake_case with a numeric suffix). "name" max 32 chars. "version" max 12 chars (default "1.0.0"). "description" max 120 chars.`;

const SYS = {
  app: `${COMMON}

CURRENT TARGET: an APPLICATION or GAME written in Lua 5.4 for the VynWatch sandbox.
- "type" is "game" for games and "app" for everything else.
- "code" is the complete Lua program (max 16 KiB UTF-8), using only the VynWatch API from the guide, with the entry points and conventions the guide requires.
- "thumbnail" is a 16x16 1-bit icon as exactly 64 hexadecimal digits (32 bytes): 16 rows, 2 bytes per row, MSB-first (the leftmost pixel is the highest bit). Design a simple, recognizable icon for the program.`,
  face: `${COMMON}

CURRENT TARGET: a WATCH FACE written in the VynWatch watch face DSL.
- "tag" is exactly one of: Digital, Analog, Hybrid, Info, Unik.
- "dsl" is plain DSL text, one command per line (max 72 commands and 1500 bytes in total), using only the commands and parameter ranges from the guide. Label text is max 13 printable ASCII characters and must not contain commas, semicolons or "|". The screen is 128x64 pixels; keep everything inside it. Always include something that shows the time.`
};

const S = { type: "STRING" };
const BASE = { reply: S, ready: { type: "BOOLEAN" }, id: S, name: S, version: S, description: S };
const SCHEMA = {
  app: { type: "OBJECT", required: ["reply", "ready"], properties: { ...BASE, type: { type: "STRING", enum: ["app", "game"] }, thumbnail: S, code: S } },
  face: { type: "OBJECT", required: ["reply", "ready"], properties: { ...BASE, tag: { type: "STRING", enum: ["Digital", "Analog", "Hybrid", "Info", "Unik"] }, dsl: S } }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.API;
  if (!key) return res.status(500).json({ error: "Environment variable API belum diatur di server." });
  const { mode, guide, messages } = req.body || {};
  if (!SYS[mode]) return res.status(400).json({ error: "mode harus 'app' atau 'face'." });
  if (typeof guide !== "string" || guide.length > 400000) return res.status(400).json({ error: "Panduan tidak valid atau terlalu besar." });
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) return res.status(400).json({ error: "messages tidak valid." });
  const contents = messages.map(m => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.text || "").slice(0, 60000) }] }));
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYS[mode]}\n\n=== REFERENCE GUIDE (authoritative) ===\n${guide}` }] },
        contents,
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA[mode], temperature: 0.4 }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || `Gemini HTTP ${r.status}` });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (!text) return res.status(502).json({ error: "Respons AI kosong (mungkin diblokir)." });
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(502).json({ error: "Gagal memanggil AI: " + e.message });
  }
};

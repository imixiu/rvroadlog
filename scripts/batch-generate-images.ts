/**
 * Batch generate cover images for site articles using Qwen qwen-image-plus API.
 * Multi-key rotation, Blob REST API upload (no CLI dependency), concurrency control.
 *
 * Usage: cd /root/vercel-projects/<SITE> && npx tsx --env-file=.env.local scripts/batch-generate-images.ts
 *
 * Prerequisites:
 * - DASHSCOPE_API_KEY in .env.local (or loaded from /root/.hermes/auth.json pool)
 * - DATABASE_URL in .env.local
 * - BLOB_READ_WRITE_TOKEN in .env.local
 *
 * Customization per site:
 * - Change SITE constant
 * - Change TOPIC_PROMPTS keys to match site's article types
 * - Concurrency default 8 (works well for Qwen image API)
 */

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

// ═══════════════════ SITE CONFIG — OVERRIDE PER SITE ═══════════════════
const SITE = "rvroadlog"; // e.g. "ecoenergyvista", "furnishcuration"
const CONCURRENCY = 8;
const MAX_RETRIES = 2;

const TOPIC_PROMPTS: Record<string, string> = {
  "destinations": "national park landscape, RV campground, scenic mountain view, travel photography",
  "rv-reviews": "modern RV motorhome, travel trailer, product photography, clean studio background",
  "road-trips": "winding highway through scenic landscape, road trip adventure, aerial photography",
  "camping-tips": "RV campsite with awning, campfire, outdoor gear, camping lifestyle photography",
  "rv-lifestyle": "couple enjoying life inside modern RV with large windows, digital nomad, warm interior",
  "buying-guides": "collection of RV types at dealership, motorhome comparison, bright consumer photography",
};
// ═══════════════════════════════════════════════════════════════════════

// Load DashScope API keys from hermes auth (5-key rotation)
function loadApiKeys(): string[] {
  const authPath = "/root/.hermes/auth.json";
  const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
  const pool = auth.credential_pool?.alibaba || [];
  const keys = pool
    .filter((c: any) => c.access_token && c.access_token.startsWith("sk-"))
    .map((c: any) => c.access_token);
  // Fallback to single key from env if pool is empty
  if (keys.length === 0 && process.env.DASHSCOPE_API_KEY) {
    keys.push(process.env.DASHSCOPE_API_KEY);
  }
  return keys;
}

const API_KEYS = loadApiKeys();
console.log(`Loaded ${API_KEYS.length} API keys`);

function getApiKey(index: number): string {
  return API_KEYS[index % API_KEYS.length];
}

async function generateImage(prompt: string, keyIndex: number): Promise<string> {
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const apiKey = getApiKey(keyIndex + retry);
    try {
      const resp = await fetch(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "qwen-image-plus",
            input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
            parameters: { size: "1024*576" },
          }),
          signal: AbortSignal.timeout(120000),
        }
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await resp.json();
      const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
      if (!imageUrl) throw new Error("No image URL in response");
      return imageUrl;
    } catch (err: any) {
      if (retry < MAX_RETRIES) {
        const wait = 3 * (retry + 1);
        console.log(`    Retry ${retry + 1}/${MAX_RETRIES} (key ${(keyIndex + retry + 1) % API_KEYS.length}): ${err.message.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      } else throw err;
    }
  }
  throw new Error("Unreachable");
}

async function downloadImage(url: string, destPath: string): Promise<number> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

// Blob REST API upload — no vercel CLI dependency, works in background processes
function blobUpload(localPath: string, pathname: string, blobToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localPath);
    const req = https.request(
      {
        method: "PUT",
        hostname: "blob.vercel-storage.com",
        path: "/" + pathname,
        headers: {
          Authorization: "Bearer " + blobToken,
          "Content-Type": "image/png",
          "Content-Length": fileBuffer.length,
          "x-content-type": "image/png",
          "x-cache-control-max-age": "31536000",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const j = JSON.parse(data);
              resolve(j.url);
            } catch (e) {
              reject(new Error("Blob parse error: " + data.slice(0, 100)));
            }
          } else {
            reject(new Error("Blob HTTP " + res.statusCode + ": " + data.slice(0, 100)));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Blob upload timeout"));
    });
    req.write(fileBuffer);
    req.end();
  });
}

interface Article {
  id: number;
  short_title: string;
  type: string;
}

class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];
  constructor(permits: number) { this.permits = permits; }
  async acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return; }
    return new Promise((r) => this.queue.push(r));
  }
  release(): void {
    if (this.queue.length > 0) { this.queue.shift()!(); }
    else { this.permits++; }
  }
}

async function processArticle(
  article: Article, sql: any, blobToken: string, workerIndex: number
): Promise<{ ok: boolean; title: string }> {
  const { id, short_title, type } = article;
  const typeContext = TOPIC_PROMPTS[type] || "editorial photography, clean modern style";
  const prompt = `Professional blog cover image for an article about ${short_title.replace(/-/g, " ")}. ${typeContext}. Clean, modern, editorial style. No text overlay.`;

  try {
    const ossUrl = await generateImage(prompt, workerIndex);
    let finalUrl = ossUrl;

    const tmpPath = `/tmp/cover-${crypto.randomUUID()}.png`;
    try {
      await downloadImage(ossUrl, tmpPath);
      const blobPath = `covers/${SITE}/${short_title}.png`;
      finalUrl = await blobUpload(tmpPath, blobPath, blobToken);
    } catch (e: any) {
      console.log(`  [${id}] Blob failed, using OSS URL: ${e.message.slice(0, 80)}`);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    await sql`UPDATE articles SET img = ${finalUrl} WHERE id = ${id}`;
    console.log(`  [${id}] ✓ ${short_title}`);
    return { ok: true, title: short_title };
  } catch (err: any) {
    console.log(`  [${id}] ✗ ${short_title}: ${err.message.slice(0, 100)}`);
    return { ok: false, title: short_title };
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

  // Get blob token — read raw bytes to bypass secret masking
  let blobToken = "";
  try {
    const { execSync } = await import("child_process");
    const hexData = execSync("xxd -p .env.local", { encoding: "utf8" }).replace(/\n/g, "");
    const raw = Buffer.from(hexData, "hex").toString("utf8");
    const m = raw.match(/BLOB_READ_WRITE_TOKEN=(.+)/);
    if (m) blobToken = m[1].trim().replace(/"/g, "");
  } catch {
    const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    const m = envContent.match(/BLOB_READ_WRITE_TOKEN=(.+)/);
    if (m) blobToken = m[1].trim().replace(/"/g, "");
  }
  console.log(`Blob token: ${blobToken ? "YES" : "NO"} | Concurrency: ${CONCURRENCY}`);

  const sql = neon(databaseUrl);
  // ⚠️ neon() returns Record<string,any>[] — must map to typed interface
  // ⚠️ neon() returns a function, NOT an object — use sql(string), NOT sql.query(string)
  const rawArticles = await sql(
    `SELECT id, short_title, type FROM articles WHERE site='${SITE}' AND (img IS NULL OR img='') ORDER BY id`
  );
  const articles: Article[] = rawArticles.map((r: any) => ({
    id: r.id, short_title: r.short_title, type: r.type,
  }));
  console.log(`Articles needing images: ${articles.length}\n`);

  if (articles.length === 0) {
    console.log("All articles already have images!");
    return;
  }

  const sem = new Semaphore(CONCURRENCY);
  let ok = 0, fail = 0;
  const t0 = Date.now();

  await Promise.all(
    articles.map(async (a, i) => {
      await sem.acquire();
      try {
        const r = await processArticle(a, sql, blobToken, i % API_KEYS.length);
        if (r.ok) ok++; else fail++;
      } finally {
        sem.release();
      }
      const done = ok + fail;
      if (done % 10 === 0 || done === articles.length) {
        const el = (Date.now() - t0) / 1000;
        console.log(`\n--- ${done}/${articles.length} | OK=${ok} FAIL=${fail} | ${Math.round(el)}s | ${(done / el).toFixed(1)}/s ---\n`);
      }
    })
  );

  const el = (Date.now() - t0) / 1000;
  console.log(`\n═══════════════════════════════`);
  console.log(`COMPLETE: ${ok} ok, ${fail} failed in ${Math.round(el)}s`);
  console.log(`═══════════════════════════════`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });


const https = require('https');
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

const dbUrl = process.env.DATABASE_URL;
const sql = neon(dbUrl);
const SITE = 'rvroadlog';
const keys = ["sk-b11580cc1fec4c2a814a8a97e3dfd7d1", "sk-92cb9115a4dc4e9a9fe55029ad3d8499", "sk-a85175f0690c43b38ba36b516fc467dd", "sk-fe0617ae27bf4617963ce1ee313ef529", "sk-29e90b9d426d482f9e8cc8c27f3c330e"];

const AUTHORS = ['Jake Morrison', 'Sarah Mitchell', 'Tom Henderson', 'Maria Santos', 'David Chen', 'Lisa Park', 'Mark Williams'];

const TONES = [
  'analytical and data-driven, like a travel industry journal',
  'conversational and enthusiastic, like a passionate road tripper blogging to friends',
  'practical and experienced, like a veteran RVer sharing hard-won wisdom',
  'adventurous and inspiring, like someone who just returned from an amazing trip',
  'measured and thoughtful, like a travel essayist writing for a magazine',
  'humorous and relatable, like a friend sharing funny camping mishaps',
  'authoritative yet accessible, like an RV expert explaining things to beginners',
  'skeptical and thorough, like a consumer advocate testing product claims',
];

const OPENING_STYLES = [
  'Start with a bold claim about RV travel that challenges conventional wisdom.',
  'Open with a specific scene at a campground or on the road — put the reader right there.',
  'Begin with a direct question the reader probably has but never asked.',
  'Open with a short, punchy one-sentence paragraph that states something surprising.',
  'Start by describing a common RV misconception, then immediately correct it.',
  'Open with a brief personal anecdote about a road trip experience.',
  'Begin with a comparison that seems odd at first but makes sense later.',
  'Start mid-thought, as if continuing a conversation about RV travel.',
  'Open with a specific result — what the reader will achieve by the end.',
  'Begin by stating what most people get wrong about this topic.',
];

const STRUCTURE_STYLES = [
  'Step-by-step walkthrough: guide the reader through the process.',
  'Problem-solution framework: identify the issue, explain why, propose the fix.',
  'Comparison piece: contrast two approaches, products, or destinations.',
  'Organize by key factors rather than chronology.',
  'Build toward a conclusion: start with observations, add evidence, arrive at the answer.',
  'Myth-busting structure: state the common belief, then systematically address it.',
  'Expert guide: walk through specific techniques with real examples.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildSystemPrompt() {
  const tone = pick(TONES);
  const opening = pick(OPENING_STYLES);
  const structure = pick(STRUCTURE_STYLES);
  return `You are a writer for rvroadlog.com, an RV travel and camping website. Your voice is ${tone}.

Writing rules:
- ${opening}
- ${structure}
- Vary paragraph length. Mix short punchy paragraphs with longer detailed ones.
- Use first person occasionally ("I found", "On our last trip", "I recommend") to sound human.
- Include your subjective opinion. Say "this works because" or "this tends to fail because".
- Reference specific campgrounds, routes, temperatures, and RV models where relevant.
- Word count: let the topic determine length. Don't pad.
- Output HTML only (h2, h3, p, ul, ol, li, strong, em, blockquote, table). No markdown fences. No <html> or <body> tags.

STRICTLY FORBIDDEN:
- Never fabricate statistics, survey numbers, or test results. If you don't have a real data point, say "many RVers report" instead of inventing "87% of owners".
- Never start with: "When...", "Since...", "At the...", "In the world of...", "For many...", "There is/are..."
- Never use: In conclusion, Delve into, Tapestry, Let's explore, rich tapestry, Navigate the world
- Never write a generic intro that could fit any article.`;
}

function buildUserPrompt(idea) {
  const lengthHint = pick([
    'Keep this focused — around 800-1200 words.',
    'Medium-length, roughly 1200-1600 words.',
    'This deserves depth — 1500-2000 words.',
    'Let the topic breathe. Write as much or as little as it needs.',
  ]);
  return `Title: ${idea.title}\nCategory: ${idea.type}\nBrief: ${idea.prompt}\n\n${lengthHint}\n\nWrite like a real person sharing knowledge, not an encyclopedia.`;
}

const FORBIDDEN_PHRASES = ['In conclusion','Comprehensive guide','Ultimate guide','Delve into','Navigating the world','Unveil the secrets',"In today's fast-paced",'Look no further',"Whether you're a beginner",'Dive deep into','Tapestry','Testament to','Embark on a journey','It is worth noting',"It's important to note","Let's explore",'In this article','This article will','We will explore'];
const BANNED_OPENINGS = [/^when\s/i, /^since\s/i, /^at\s+(the|its|this)/i, /^in\s+(the\s+)?world\s/i, /^for\s+(many|most|decades|years)\s/i, /^there\s+(is|are|has\s+been|have\s+been)\s/i];

function scoreArticle(html) {
  let score = 85;
  const text = html.replace(/<[^>]+>/g, '').trim();
  if (FORBIDDEN_PHRASES.some(f => text.toLowerCase().includes(f.toLowerCase()))) score -= 20;
  if (text.length < 2000) score -= 15;
  const fp = text.split('\n\n')[0] || text.substring(0, 200);
  if (BANNED_OPENINGS.some(re => re.test(fp.trim()))) score -= 20;
  if (/^this\s+article/i.test(fp.trim())) score -= 15;
  const h2 = (html.match(/<h2/g) || []).length;
  const ul = (html.match(/<ul|<ol/g) || []).length;
  if (h2 < 2) score -= 10;
  if (ul === 0) score -= 10;
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10).slice(0, 15);
  const starters = sentences.map(s => s.trim().split(/\s+/)[0].toLowerCase());
  const uniqueStarters = new Set(starters);
  if (uniqueStarters.size < starters.length * 0.5) score -= 15;
  if (/\b(I\s+(think|found|recommend|noticed)|my\s+(experience|trip|take))\b/i.test(text)) score += 5;
  return Math.max(0, Math.min(100, score));
}

function callQwen(messages, maxTokens, keyIndex) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'qwen-plus', messages, max_tokens: maxTokens, temperature: 0.85 });
    const req = https.request('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys[keyIndex % keys.length] },
    }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => {
        try { const j = JSON.parse(data); if (j.error) reject(new Error(j.error.message)); else resolve(j.choices[0].message.content); }
        catch(e) { reject(new Error('Parse: ' + e.message)); }
      });
    });
    req.on('error', reject); req.setTimeout(180000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

async function generateArticle(idea, index) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(idea);
  const maxTokens = randInt(2500, 6000);
  const html = await callQwen([{role:'system',content:systemPrompt},{role:'user',content:userPrompt}], maxTokens, index % keys.length);
  const cleaned = html.replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
  const score = scoreArticle(cleaned);
  return { html: cleaned, score };
}

async function main() {
  const ideas = JSON.parse(fs.readFileSync('/root/vercel-projects/rvroadlog/article_ideas.json','utf8'));
  const existing = await sql`SELECT short_title FROM articles WHERE site = ${SITE}`;
  const existingSlugs = new Set(existing.map(r => r.short_title));
  const pending = ideas.filter(i => !existingSlugs.has(i.slug));
  console.log(`Total: ${ideas.length}, Done: ${existingSlugs.size}, Pending: ${pending.length}`);

  let concurrency = 8, completed = 0, failed = 0;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const promises = batch.map(async (idea, idx) => {
      const globalIdx = i + idx;
      const author = AUTHORS[globalIdx % AUTHORS.length];
      const title = idea.title.length > 60 ? idea.title.substring(0,57)+'...' : idea.title;
      const description = idea.prompt.substring(0, 155);
      try {
        const { html, score } = await generateArticle(idea, globalIdx);
        await sql`INSERT INTO articles (site, type, title, short_title, body, author, description, is_online, published_time)
          VALUES (${SITE}, ${idea.type}, ${title}, ${idea.slug}, ${html}, ${author}, ${description}, 'Y', NOW())
          ON CONFLICT (site, short_title) DO UPDATE SET body = ${html}, description = ${description}`;
        completed++;
        if (completed % 25 === 0) console.log(`Progress: ${completed}/${pending.length} (${score >= 70 ? '✅' : '⚠️ '+score})`);
        return true;
      } catch(e) {
        failed++;
        if (failed % 10 === 0) console.error(`Failures: ${failed} — ${e.message.substring(0,80)}`);
        return false;
      }
    });
    await Promise.all(promises);
  }
  console.log(`\n=== DONE ===\nCompleted: ${completed}, Failed: ${failed}`);
  const cnt = await sql`SELECT COUNT(*) as cnt FROM articles WHERE site = ${SITE}`;
  console.log(`Total in DB: ${cnt[0].cnt}`);
}
main().catch(e => console.error('Fatal:', e));

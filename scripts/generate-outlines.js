
const https = require('https');
const fs = require('fs');

const keys = ["sk-b11580cc1fec4c2a814a8a97e3dfd7d1", "sk-92cb9115a4dc4e9a9fe55029ad3d8499", "sk-a85175f0690c43b38ba36b516fc467dd", "sk-fe0617ae27bf4617963ce1ee313ef529", "sk-29e90b9d426d482f9e8cc8c27f3c330e"];

const CATEGORIES = [
  { key: 'destinations', label: 'Destinations' },
  { key: 'rv-reviews', label: 'RV Reviews' },
  { key: 'road-trips', label: 'Road Trips' },
  { key: 'camping-tips', label: 'Camping Tips' },
  { key: 'rv-lifestyle', label: 'RV Lifestyle' },
  { key: 'buying-guides', label: 'Buying Guides' },
];

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

function repairJson(text) {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { const p = JSON.parse(cleaned); if (Array.isArray(p)) return p; } catch(e) {}
  let last = cleaned.lastIndexOf('}');
  if (last > 0) {
    let t = cleaned.substring(0, last + 1).replace(/,\s*$/, '') + ']';
    try { const p = JSON.parse(t); if (Array.isArray(p)) return p; } catch(e) {}
  }
  const objects = [];
  const regex = /\{[^{}]*"title"[^{}]*"slug"[^{}]*"prompt"[^{}]*\}/g;
  let m; while ((m = regex.exec(cleaned)) !== null) { try { objects.push(JSON.parse(m[0])); } catch(e) {} }
  return objects;
}

async function generateBatch(category, batchNum, keyIndex) {
  const prompt = `Generate 25 unique, highly specific article ideas for the "${category.label}" category of an RV travel and camping website (rvroadlog.com).

For each article, provide:
1. A specific, compelling title (include concrete details, numbers, or scenarios)
2. A URL slug (lowercase, hyphenated, max 60 chars)
3. A detailed writing brief (2-3 sentences) specifying the exact angle, target reader, and 3-5 subtopics

Requirements:
- No two articles should cover the same ground
- Avoid generic "ultimate guide" angles
- Include variety: how-to, comparison, troubleshooting, seasonal, myth-busting, beginner vs advanced

Output as JSON array: [{"title":"...","slug":"...","prompt":"..."}, ...]`;

  try {
    const raw = await callQwen([{ role: 'user', content: prompt }], 8000, keyIndex);
    const ideas = repairJson(raw);
    return ideas.map(i => ({ ...i, type: category.key }));
  } catch(e) { console.error(`  Error [${category.key} b${batchNum}]: ${e.message}`); return []; }
}

async function main() {
  const allIdeas = {};
  const BATCHES = 4;
  for (let b = 0; b < BATCHES; b++) {
    console.log(`\n=== Batch ${b+1}/${BATCHES} ===`);
    for (let c = 0; c < CATEGORIES.length; c += 2) {
      const group = CATEGORIES.slice(c, c + 2);
      console.log(`  ${group.map(g => g.key).join(', ')}`);
      const results = await Promise.all(group.map((cat, i) => generateBatch(cat, b, c + i + b * 6)));
      results.forEach((ideas, i) => {
        const cat = group[i];
        if (!allIdeas[cat.key]) allIdeas[cat.key] = [];
        allIdeas[cat.key].push(...ideas);
        console.log(`  ${cat.key}: +${ideas.length} (total: ${allIdeas[cat.key].length})`);
      });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  const balanced = [];
  for (const cat of CATEGORIES) {
    const ideas = allIdeas[cat.key] || [];
    for (let i = ideas.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ideas[i], ideas[j]] = [ideas[j], ideas[i]]; }
    const trimmed = ideas.slice(0, 83);
    balanced.push(...trimmed);
    console.log(`${cat.key}: ${ideas.length} → ${trimmed.length}`);
  }
  fs.writeFileSync('/root/vercel-projects/rvroadlog/article_ideas.json', JSON.stringify(balanced, null, 2));
  console.log(`\n✅ Total: ${balanced.length} outlines saved`);
}
main().catch(e => console.error('Fatal:', e));

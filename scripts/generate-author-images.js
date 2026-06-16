
const { neon } = require('@neondatabase/serverless');
const https = require('https');
const fs = require('fs');

const dbUrl = process.env.DATABASE_URL;
const keys = ["sk-b11580cc1fec4c2a814a8a97e3dfd7d1", "sk-92cb9115a4dc4e9a9fe55029ad3d8499", "sk-a85175f0690c43b38ba36b516fc467dd", "sk-fe0617ae27bf4617963ce1ee313ef529", "sk-29e90b9d426d482f9e8cc8c27f3c330e"];
const blobToken = "vercel_blob_rw_9bWbXubcYU3vBaiQ_kQ1HfhFlMppx53jz72yf2tDUdAtcqU";

const authors = [
  { slug: 'jake-morrison', desc: 'a rugged outdoorsy man with sun-tanned skin and friendly smile wearing casual hiking gear' },
  { slug: 'sarah-mitchell', desc: 'a professional woman in smart casual attire with confident warm expression' },
  { slug: 'tom-henderson', desc: 'a middle-aged man in work clothes with tool belt, practical friendly look' },
  { slug: 'maria-santos', desc: 'a creative Latina woman with camera strap around neck, artistic warm personality' },
  { slug: 'david-chen', desc: 'an Asian male researcher with glasses and analytical thoughtful expression' },
  { slug: 'lisa-park', desc: 'a young Asian female blogger with cheerful personality and casual travel style' },
  { slug: 'mark-williams', desc: 'a middle-aged Caucasian man with map in hand, adventurous confident look' },
  { slug: 'team', desc: 'a diverse group of travel enthusiasts collaborating around a campfire at sunset' },
];

function gen(prompt, ki) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: 'qwen-image-plus', input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { size: '512*512' } });
    const req = https.request({ hostname: 'dashscope.aliyuncs.com', path: '/api/v1/services/aigc/multimodal-generation/generation', method: 'POST', headers: { 'Authorization': 'Bearer ' + keys[ki % keys.length], 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => {
        try { const j = JSON.parse(body); const url = j?.output?.choices?.[0]?.message?.content?.[0]?.image; if (url) resolve(url); else reject(new Error('No img')); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject); req.setTimeout(120000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

function download(url, path) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      const mod = u.startsWith('https') ? require('https') : require('http');
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(res.headers.location);
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { fs.writeFileSync(path, Buffer.concat(chunks)); resolve(); });
      }).on('error', reject);
    };
    get(url);
  });
}

function blob(pathname, localPath) {
  return new Promise((resolve, reject) => {
    const buf = fs.readFileSync(localPath);
    const req = https.request({ method: 'PUT', hostname: 'blob.vercel-storage.com', path: '/' + pathname, headers: { 'Authorization': 'Bearer ' + blobToken, 'Content-Type': 'image/png', 'Content-Length': buf.length, 'x-content-type': 'image/png', 'x-cache-control-max-age': '31536000' } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data).url); } catch(e) { reject(e); } }
        else reject(new Error('Blob ' + res.statusCode));
      });
    });
    req.on('error', reject); req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(buf); req.end();
  });
}

async function main() {
  const sql = neon(dbUrl);
  for (let i = 0; i < authors.length; i++) {
    const a = authors[i];
    const prompt = `Professional headshot portrait of ${a.desc}, studio lighting, clean background, high quality photography`;
    console.log(`[${i+1}/${authors.length}] ${a.slug}`);
    try {
      const url = await gen(prompt, i);
      const tmp = `/tmp/author-${a.slug}.png`;
      await download(url, tmp);
      const blobUrl = await blob(`authors/rvroadlog/${a.slug}.png`, tmp);
      await sql`UPDATE authors SET img = ${blobUrl} WHERE site = 'rvroadlog' AND slug = ${a.slug}`;
      console.log(`  ✅ ${blobUrl.substring(0, 60)}...`);
      fs.unlinkSync(tmp);
    } catch(e) { console.error(`  ❌ ${e.message}`); }
  }
}
main();

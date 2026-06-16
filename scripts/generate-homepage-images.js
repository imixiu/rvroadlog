
const https = require('https');
const fs = require('fs');

const keys = ["sk-b11580cc1fec4c2a814a8a97e3dfd7d1", "sk-92cb9115a4dc4e9a9fe55029ad3d8499", "sk-a85175f0690c43b38ba36b516fc467dd", "sk-fe0617ae27bf4617963ce1ee313ef529", "sk-29e90b9d426d482f9e8cc8c27f3c330e"];
const blobToken = "vercel_blob_rw_9bWbXubcYU3vBaiQ_kQ1HfhFlMppx53jz72yf2tDUdAtcqU";

const images = [
  { name: 'hero', prompt: 'Modern luxury RV motorhome parked at a scenic mountain overlook with dramatic sunset sky, pine trees, and winding road below, professional landscape photography, warm golden light, no text', size: '1024*576' },
  { name: 'topic-destinations', prompt: 'Beautiful national park landscape with RV campground in foreground, mountains and lake in background, golden hour lighting, travel photography, no text', size: '800*400' },
  { name: 'topic-reviews', prompt: 'Modern RV motorhome and travel trailer side by side on a clean showroom floor, product photography, bright studio lighting, no text', size: '800*400' },
  { name: 'topic-road-trips', prompt: 'Aerial view of a winding highway through forest with an RV driving along, road trip adventure, dramatic landscape, no text', size: '800*400' },
  { name: 'topic-camping', prompt: 'Cozy RV campsite with awning extended, campfire, string lights, camping chairs, and mountain view at dusk, lifestyle photography, no text', size: '800*400' },
  { name: 'topic-lifestyle', prompt: 'Couple working on laptops inside a modern RV with large windows showing desert landscape outside, digital nomad lifestyle, warm interior lighting, no text', size: '800*400' },
  { name: 'topic-buying', prompt: 'Various RV types lined up at a dealership lot, Class A motorhome, fifth wheel, travel trailer, camper van, consumer photography, no text', size: '800*400' },
  { name: 'article-destinations', prompt: 'Stunning coastal highway with ocean cliffs and an RV parked at a scenic viewpoint, travel destination photography, blue sky, no text', size: '800*400' },
  { name: 'article-rv-review', prompt: 'Interior of a modern luxury RV with kitchen, dining area, and bedroom visible, professional interior photography, warm lighting, no text', size: '800*400' },
  { name: 'article-road-trip', prompt: 'Classic American highway stretching into the distance through desert landscape with RV in foreground, route planning concept, no text', size: '800*400' },
  { name: 'article-camping-tips', prompt: 'Campfire cooking setup next to an RV with cast iron skillet and grilling tools, outdoor cooking photography, warm evening light, no text', size: '800*400' },
  { name: 'article-lifestyle', prompt: 'Family enjoying breakfast inside a spacious RV with large windows showing a forest campground, lifestyle photography, cozy warm tones, no text', size: '800*400' },
  { name: 'article-buying', prompt: 'Close-up of RV features and controls dashboard with modern technology displays, buying decision concept, clean product photography, no text', size: '800*400' },
];

function gen(prompt, size, ki) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: 'qwen-image-plus', input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { size } });
    const req = https.request({ hostname: 'dashscope.aliyuncs.com', path: '/api/v1/services/aigc/multimodal-generation/generation', method: 'POST', headers: { 'Authorization': 'Bearer ' + keys[ki % keys.length], 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => {
        try { const j = JSON.parse(body); const url = j?.output?.choices?.[0]?.message?.content?.[0]?.image; if (url) resolve(url); else reject(new Error('No img: ' + body.substring(0, 100))); }
        catch(e) { reject(new Error('Parse: ' + e.message)); }
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
        if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data).url); } catch(e) { reject(new Error('Blob parse')); } }
        else reject(new Error('Blob ' + res.statusCode));
      });
    });
    req.on('error', reject); req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(buf); req.end();
  });
}

async function main() {
  const results = {};
  for (let i = 0; i < images.length; i += 2) {
    const batch = images.slice(i, i + 2);
    for (const img of batch) {
      console.log(`[${i + batch.indexOf(img) + 1}/${images.length}] ${img.name}`);
      try {
        const url = await gen(img.prompt, img.size, i + batch.indexOf(img));
        const tmp = `/tmp/hp-${img.name}.png`;
        await download(url, tmp);
        const blobUrl = await blob(`homepage/rvroadlog/${img.name}.png`, tmp);
        results[img.name] = blobUrl;
        console.log(`  ✅ ${blobUrl.substring(0, 60)}...`);
        fs.unlinkSync(tmp);
      } catch(e) { console.error(`  ❌ ${e.message}`); results[img.name] = null; }
    }
  }
  fs.writeFileSync('/tmp/homepage-images-rv.json', JSON.stringify(results, null, 2));
  console.log('\n=== Homepage Images ===');
  for (const [n, u] of Object.entries(results)) console.log(`${n}: ${u || 'FAILED'}`);
}
main();

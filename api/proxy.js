export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const allowed = [
    'vlr.orlandomm.net',
    'vlrggapi.vercel.app',
    'api.bilibili.com',
    'liquipedia.net',
    'esports-api.service.valorantesports.com',
    'valorant.fandom.com',
    'valorant.fandom.com',
  ];

  let parsed;
  try { parsed = new URL(url); } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };
    if (parsed.hostname.includes('valorantesports.com')) {
      headers['x-api-key'] = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
    }
    if (parsed.hostname.includes('liquipedia.net')) {
      headers['Accept-Encoding'] = 'gzip';
    }
    if (parsed.hostname.includes('bilibili.com')) {
      headers['Referer'] = 'https://www.bilibili.com';
      headers['Origin'] = 'https://www.bilibili.com';
    }

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const text = await resp.text();

    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(resp.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

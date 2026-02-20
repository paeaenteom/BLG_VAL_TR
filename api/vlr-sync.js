// VLR.gg BLG Match Agent Sync - Vercel Serverless Function
// Fetches recent BLG matches from VLR.gg, extracts agent compositions + scores
// Returns JSON for frontend merge with static VLR_AGENT_DATA

const TEAM_ID = '12010';
const VLR_BASE = 'https://www.vlr.gg';
const MATCH_LIST_URL = `${VLR_BASE}/team/matches/${TEAM_ID}/bilibili-gaming/`;

// VLR display name → tracker tag
const TAG_MAP = {
  'EDward Gaming':'EDG','Edward Gaming':'EDG','TYLOO':'TYL','Top Esports':'TES',
  'JD Gaming':'JDG','FunPlus Phoenix':'FPX','All Gamers':'AG','Dragon Ranger Gaming':'DRG',
  'Wolves Esports':'WOL','Nova Esports':'NV','NOVA Esports':'NV',
  'Titan Esports Club':'TEC','Trace Esports':'TE','X10 Gaming':'XLG','Xiaolong Gaming':'XLG',
  'Fnatic':'FNC','FNATIC':'FNC','Leviatán':'LEV','Leviatan':'LEV',
  'Paper Rex':'PRX','Gen.G':'GEN','G2 Esports':'G2','DRX':'DRX',
  'Sentinels':'SEN','Team Liquid':'TL','NRG Esports':'NRG','NRG':'NRG',
  'Karmine Corp':'KC','MIBR':'MIBR','Rex Regum Qeon':'RRQ','RRQ':'RRQ',
  'KRÜ Esports':'KRÜ','Nongshim RedForce':'NS',
  // CN teams
  'Nighthunters Gaming':'NWG','Monarch Esports':'ME','Oxyg3niOus':'O3O',
  'GameKing':'GK','KaiZe':'KZ','NewHappy Esports':'NH','Four Angry Men':'4AM',
  'Douyu Gaming':'DG','DouYu Gaming':'DG','Invincible Gaming':'iNv',
  'Rare Atom':'RA','Royal Never Give Up':'RNG','LGD Gaming':'LGD',
  'Totoro Gaming':'TTG','Shenzhen NTER':'NTER','Number One Player':'NOP',
  'JiJieHao':'JJH','Invictus Gaming':'iG','Attacking Soul Esports':'ASE',
  'Valor Gaming':'VLG','Nine Hitter':'NH',
};

// Fallback: generate 2-4 char tag from team name
function makeTag(name) {
  const mapped = TAG_MAP[name];
  if (mapped) return mapped;
  // Try partial match
  for (const [k, v] of Object.entries(TAG_MAP)) {
    if (name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase())) return v;
  }
  // Generate from initials or first word
  const words = name.replace(/[^A-Za-z\s]/g, '').trim().split(/\s+/);
  if (words.length >= 2) return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
  return name.slice(0, 3).toUpperCase();
}

// Known VALORANT agents
const AGENTS = [
  'Astra','Breach','Brimstone','Chamber','Clove','Cypher','Deadlock',
  'Fade','Gekko','Harbor','Iso','Jett','KAY/O','Killjoy','Neon',
  'Omen','Phoenix','Raze','Reyna','Sage','Skye','Sova',
  'Tejo','Veto','Viper','Vyse','Waylay','Yoru'
];

function extractAgentsFromText(text) {
  const found = [];
  for (const a of AGENTS) {
    const lc = a.toLowerCase().replace('/', '');
    if (text.toLowerCase().replace('/', '').includes(lc)) found.push(a);
  }
  return found;
}

// Parse match listing page HTML
function parseListingPage(html) {
  const results = [];
  
  // Match each match card: <a class="wf-card" href="/MATCHID/..."
  const cardRe = /<a[^>]*class="[^"]*wf-card[^"]*"[^>]*href="(\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let card;
  while ((card = cardRe.exec(html)) !== null) {
    const [, matchUrl, cardHtml] = card;
    
    // Extract date
    const dateRe = /(\d{4}-\d{2}-\d{2})/;
    const dateM = cardHtml.match(dateRe);
    if (!dateM) continue;
    const date = dateM[1];
    
    // Extract teams
    const teamRe = /<div[^>]*class="[^"]*m-item-team-name[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const teams = [];
    let tm;
    while ((tm = teamRe.exec(cardHtml)) !== null) {
      teams.push(tm[1].replace(/<[^>]+>/g, '').trim());
    }
    if (teams.length < 2) continue;
    
    const blgIdx = teams.findIndex(t => t.toLowerCase().includes('bilibili'));
    if (blgIdx === -1) continue;
    const oppIdx = blgIdx === 0 ? 1 : 0;
    const oppName = teams[oppIdx];
    const tag = makeTag(oppName);
    
    // Extract match score
    const scoreRe = /<div[^>]*class="[^"]*m-item-result[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const scoreM = cardHtml.match(scoreRe);
    let bs = 0, os = 0;
    if (scoreM) {
      const nums = scoreM[1].replace(/<[^>]+>/g, '').trim().match(/(\d+)\s*[:\-–]\s*(\d+)/);
      if (nums) {
        bs = parseInt(blgIdx === 0 ? nums[1] : nums[2]);
        os = parseInt(blgIdx === 0 ? nums[2] : nums[1]);
      }
    }
    
    // Extract per-game agent compositions
    const games = [];
    const gameRe = /<div[^>]*class="[^"]*m-item-games-comp[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    // Also try game cards
    const gcRe = /<div[^>]*class="[^"]*m-item-games[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    
    // Try to find individual game info
    const mapRe = /<div[^>]*class="[^"]*map[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    
    results.push({
      date,
      tag,
      oppName,
      matchUrl: VLR_BASE + matchUrl,
      bs,
      os,
      maps: [], // Will be filled by individual page fetch
      _needsFetch: true
    });
  }
  
  return results;
}

// Parse individual match page for detailed agent data
function parseMatchPage(html, oppTag) {
  const maps = [];
  
  // Find map sections - each game tab or game section
  // VLR uses different structures, try multiple patterns
  
  // Pattern 1: vm-stats-game sections
  const gameRe = /<div[^>]*class="[^"]*vm-stats-game[^"]*"[^>]*data-game-id="[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*vm-stats-game|$)/gi;
  let game;
  const gameBlocks = [];
  while ((game = gameRe.exec(html)) !== null) {
    gameBlocks.push(game[1]);
  }
  
  // If no vm-stats-game, try simpler approach
  if (gameBlocks.length === 0) {
    // Try table-based approach
    const tableRe = /<table[^>]*class="[^"]*wf-table-inset[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
    let tbl;
    while ((tbl = tableRe.exec(html)) !== null) {
      gameBlocks.push(tbl[1]);
    }
  }
  
  for (const block of gameBlocks) {
    // Extract map name
    let mapName = '';
    const mapNames = ['Ascent','Bind','Breeze','Fracture','Haven','Icebox','Lotus','Pearl','Split','Sunset','Abyss','Corrode'];
    for (const mn of mapNames) {
      if (block.includes(mn)) { mapName = mn; break; }
    }
    if (!mapName) continue;
    
    // Extract agents from img tags
    const imgRe = /(?:src|alt|title)="[^"]*?(astra|breach|brimstone|chamber|clove|cypher|deadlock|fade|gekko|harbor|iso|jett|kay.?o|killjoy|neon|omen|phoenix|raze|reyna|sage|skye|sova|tejo|veto|viper|vyse|waylay|yoru)[^"]*"/gi;
    const agentList = [];
    let im;
    while ((im = imgRe.exec(block)) !== null) {
      let name = im[1].toLowerCase();
      // Normalize
      const agentMap = {
        'astra':'Astra','breach':'Breach','brimstone':'Brimstone','chamber':'Chamber',
        'clove':'Clove','cypher':'Cypher','deadlock':'Deadlock','fade':'Fade',
        'gekko':'Gekko','harbor':'Harbor','iso':'Iso','jett':'Jett',
        'killjoy':'Killjoy','neon':'Neon','omen':'Omen','phoenix':'Phoenix',
        'raze':'Raze','reyna':'Reyna','sage':'Sage','skye':'Skye','sova':'Sova',
        'tejo':'Tejo','veto':'Veto','viper':'Viper','vyse':'Vyse',
        'waylay':'Waylay','yoru':'Yoru'
      };
      if (name.includes('kay')) name = 'KAY/O';
      else name = agentMap[name] || name.charAt(0).toUpperCase() + name.slice(1);
      
      if (!agentList.includes(name)) agentList.push(name);
    }
    
    // Split into team1 (first 5) and team2 (next 5)
    const t1 = agentList.slice(0, 5);
    const t2 = agentList.slice(5, 10);
    
    // Extract scores from the game block
    const scoreNums = [];
    const scoreRe = />(\d{1,2})<\/(?:span|div|td)/g;
    let sc;
    while ((sc = scoreRe.exec(block)) !== null) {
      const n = parseInt(sc[1]);
      if (n >= 0 && n <= 30) scoreNums.push(n);
    }
    
    let s1 = 0, s2 = 0;
    // Find the two scores that look like round scores (sum ~= 24 or close)
    for (let i = 0; i < scoreNums.length - 1; i++) {
      const a = scoreNums[i], b = scoreNums[i + 1];
      if (a + b >= 12 && a + b <= 30 && (a >= 13 || b >= 13)) {
        s1 = a; s2 = b; break;
      }
    }
    
    maps.push({
      m: mapName,
      b: t1,
      o: t2,
      bs: s1,
      os: s2
    });
  }
  
  return maps;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  
  try {
    const { after, limit = 10 } = req.query;
    
    // Fetch BLG match listing page
    const listResp = await fetch(MATCH_LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!listResp.ok) {
      return res.status(502).json({ error: 'VLR fetch failed', status: listResp.status });
    }
    
    const listHtml = await listResp.text();
    
    // Parse listing - get match URLs + basic info
    // Simpler regex approach for the listing page
    const matches = [];
    
    // Extract match links and dates from listing
    // Each match row looks like: <a href="/MATCHID/team1-vs-team2/..." with date and team info
    const rowRe = /href="(\/(\d+)\/[^"]*bilibili[^"]*)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*m-item-date[^"]*"[^>]*>[\s\S]*?(\d{4}-\d{2}-\d{2})/gi;
    
    // More robust: extract all match links
    const linkRe = /href="(\/(\d+)\/[^"]+)"[^>]*>/gi;
    const matchLinks = new Set();
    let lm;
    while ((lm = linkRe.exec(listHtml)) !== null) {
      if (lm[1].includes('bilibili') || listHtml.substring(Math.max(0, lm.index - 500), lm.index + 500).toLowerCase().includes('bilibili')) {
        matchLinks.add(lm[1]);
      }
    }
    
    // Parse dates and opponent info from match cards  
    // Look for date pattern near match links
    const dateTeamRe = /(\d{4}-\d{2}-\d{2})[\s\S]{0,2000}?href="(\/(\d+)\/[^"]+)"[\s\S]{0,1000}?(?:m-item-team-name[^>]*>[\s]*([^<]+))/gi;
    
    // Simpler: fetch individual match pages for recent matches
    // Get all match IDs from the page
    const matchIdRe = /href="\/((\d{4,7})\/[^"]*(?:bilibili|blg)[^"]*)"[^>]*>/gi;
    const matchIds = [];
    let mid;
    while ((mid = matchIdRe.exec(listHtml)) !== null) {
      if (!matchIds.find(m => m.id === mid[2])) {
        matchIds.push({ id: mid[2], path: '/' + mid[1] });
      }
    }
    
    // Limit to recent matches
    const fetchLimit = Math.min(parseInt(limit) || 10, 20);
    const toFetch = matchIds.slice(0, fetchLimit);
    
    // Fetch individual match pages with rate limiting
    const results = {};
    for (const { id, path } of toFetch) {
      try {
        await new Promise(r => setTimeout(r, 500)); // Rate limit
        
        const pageResp = await fetch(VLR_BASE + path, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          }
        });
        
        if (!pageResp.ok) continue;
        const pageHtml = await pageResp.text();
        
        // Extract date
        const dateM = pageHtml.match(/class="[^"]*moment-tz-convert[^"]*"[^>]*data-utc-ts="(\d{4}-\d{2}-\d{2})/);
        const date = dateM ? dateM[1] : null;
        if (!date) continue;
        
        // Extract teams
        const teamNameRe = /class="[^"]*wf-title-med[^"]*"[^>]*>\s*([^<]+)/gi;
        const teamNames = [];
        let tn;
        while ((tn = teamNameRe.exec(pageHtml)) !== null) {
          teamNames.push(tn[1].trim());
        }
        
        const blgI = teamNames.findIndex(t => t.toLowerCase().includes('bilibili'));
        if (blgI === -1) continue;
        const oppI = blgI === 0 ? 1 : 0;
        const oppName = teamNames[oppI] || 'Unknown';
        const tag = makeTag(oppName);
        
        // Parse maps + agents
        const maps = parseMatchPage(pageHtml, tag);
        
        // Determine BLG side and swap if needed
        if (blgI === 1 && maps.length > 0) {
          // BLG is team2, swap agents
          maps.forEach(m => {
            const tmpB = m.b; m.b = m.o; m.o = tmpB;
            const tmpS = m.bs; m.bs = m.os; m.os = tmpS;
          });
        }
        
        const key = `${date}_${tag}`;
        results[key] = {
          p: '',
          d: maps.map(m => ({
            m: m.m,
            b: m.b,
            o: m.o,
            bs: m.bs,
            os: m.os
          }))
        };
        
      } catch (e) {
        console.error(`Error fetching match ${id}:`, e.message);
      }
    }
    
    return res.status(200).json({
      ok: true,
      count: Object.keys(results).length,
      fetched: toFetch.length,
      data: results,
      ts: new Date().toISOString()
    });
    
  } catch (e) {
    console.error('VLR sync error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// BLG Tracker Service Worker - Background Notifications
const CACHE_NAME='blg-sw-v1';

// Install
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

// Background live match check
let lastLiveState=null;

async function checkLive(){
  try{
    const apiUrl='https://esports-api.service.valorantesports.com/persisted/val/getSchedule?hl=en-US&sport=val&leagueId=111691194187846945';
    const proxyUrl=self.location.origin+'/api/proxy?url='+encodeURIComponent(apiUrl);
    const r=await fetch(proxyUrl,{signal:AbortSignal.timeout(10000)});
    if(!r.ok)return;
    const d=await r.json();
    if(!d?.data?.schedule?.events)return;
    const live=d.data.schedule.events.find(ev=>{
      if(ev.state!=='inProgress')return false;
      return(ev.match?.teams||[]).some(t=>{
        const n=(t.name||'').toLowerCase();
        return n.includes('bilibili')||n.includes('blg');
      });
    });
    if(live&&!lastLiveState){
      const teams=live.match?.teams||[];
      const opp=teams.find(t=>{const n=(t.name||'').toLowerCase();return!n.includes('bilibili')&&!n.includes('blg');});
      showNotif('🔴 BLG 라이브!',`${live.league?.name||'VCT'} · vs ${opp?.name||'???'}`);
    }
    if(!live&&lastLiveState){
      const teams=lastLiveState.match?.teams||[];
      const opp=teams.find(t=>{const n=(t.name||'').toLowerCase();return!n.includes('bilibili')&&!n.includes('blg');});
      showNotif('🏁 경기 종료',`vs ${opp?.name||'???'} · VOD 곧 업데이트`);
    }
    lastLiveState=live||null;
  }catch(e){}
}

function showNotif(title,body){
  self.registration.showNotification(title,{
    body,
    icon:'/favicon.ico',
    badge:'/favicon.ico',
    tag:'blg-live-'+Date.now(),
    data:{url:self.location.origin},
    requireInteraction:false,
    silent:false,
    vibrate:[200,100,200]
  });
}

// Click notification → open/focus tracker
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window'}).then(clients=>{
      const existing=clients.find(c=>c.url.includes(self.location.origin));
      if(existing){existing.focus();return}
      return self.clients.openWindow(e.notification.data?.url||'/');
    })
  );
});

// Message from main page
self.addEventListener('message',e=>{
  if(e.data==='check-live')checkLive();
});

// Periodic sync (if supported)
self.addEventListener('periodicsync',e=>{
  if(e.tag==='blg-live-check')e.waitUntil(checkLive());
});

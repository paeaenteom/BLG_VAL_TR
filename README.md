# BLG VALORANT Tracker

Bilibili Gaming(BLG)의 VALORANT 경기 기록을 실시간으로 추적하는 웹 트래커입니다.

## 주요 기능

- **실시간 경기 추적** — Riot Esports API를 통해 라이브 경기 감지 및 알림
- **전체 대전 기록** — 2023년부터 현재까지 BLG의 모든 VCT/FGC/EVO 경기 결과
- **에이전트 구성 조회** — 맵별 BLG 및 상대팀 에이전트 픽 확인 (VLR.gg + Liquipedia 데이터)
- **VOD 연동** — Bilibili(B站), YouTube, SOOP 플랫폼 VOD 바로 보기
- **다음 경기 일정** — 카운트다운 타이머 포함 일정 표시
- **통계 대시보드** — 맵별 승률, 상대 전적(H2H), 에이전트 사용률
- **로스터 정보** — 연도별 BLG 선수 구성
- **스킨 갤러리** — BLG 관련 VALORANT 스킨 정보
- **PWA 지원** — 모바일 홈 화면 추가 및 백그라운드 알림 (Service Worker)

## 기술 스택

- **프론트엔드**: Vanilla HTML/CSS/JS (프레임워크 없음)
- **백엔드**: Vercel Serverless Functions (Node.js)
- **데이터 소스**:
  - [Riot Esports API](https://esports-api.service.valorantesports.com) — 일정, 라이브 스코어, 팀 로고
  - [VLR.gg](https://vlr.gg) — 에이전트 구성 (프록시 경유)
  - [Liquipedia](https://liquipedia.net/valorant/) — 에이전트, MVP, 맵 베토
  - [Bilibili API](https://api.bilibili.com) — VOD 자동 탐색

## 프로젝트 구조

```
public/
  index.html        # 메인 트래커 (경기 기록, 통계, 로스터, 스킨)
  vlr-agents.js     # VLR.gg 에이전트 정적 데이터
  sw.js             # Service Worker (라이브 알림)
  lp-extract.html   # Liquipedia 에이전트/MVP 추출 도구
  lp-diag.html      # Liquipedia API 진단 도구
  ig-logo.svg       # Invictus Gaming 로고
api/
  proxy.js          # CORS 프록시 (허용 도메인 제한)
  vlr-sync.js       # VLR.gg 에이전트 동기화 API
vercel.json         # Vercel 배포 설정
```

## 배포

Vercel에 배포됩니다. `vercel.json`에 빌드 및 함수 설정이 포함되어 있습니다.

```bash
# Vercel CLI로 배포
vercel
```

## 데이터 업데이트

- **자동**: Riot Esports API에서 라이브/예정 경기를 3분 간격으로 갱신
- **반자동**: `vlr-sync.js` API를 통해 VLR.gg에서 최신 에이전트 데이터 동기화
- **수동**: `lp-extract.html`로 Liquipedia에서 에이전트/MVP 데이터 일괄 추출 후 `vlr-agents.js`에 반영

# HAJUN ARCADE

`games.hajunshin.com`용 모바일 우선 3D 웹 아케이드입니다.

## 게임

- **3쿠션** — 6샷 동안 수구가 두 목적구를 맞히고, 두 번째 목적구 전에 쿠션 3회 이상 접촉하면 1점
- **한국식 4구** — 6샷 동안 흰 수구로 빨간 목적구 2개를 모두 맞히면 1점, 노란 상대 수구 접촉은 파울
- **Classic Yacht** — 5개 주사위, 턴당 최대 3회 롤, 12개 원형 Yacht 카테고리의 합산 점수(최대 297점)

규칙 기준: [UMB Carom rules](https://files.umb-carom.org/public/nstatutes.aspx), [대한당구연맹 4구 안내](https://kr.object.ncloudstorage.com/kbfdiv/2025_kbf_division_manual.pdf.pdf), [Classic Yacht scoring](https://en.wikipedia.org/wiki/Yacht_%28dice_game%29).

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

Supabase 환경변수가 없으면 기록은 브라우저 `localStorage`에 저장됩니다. 게임 자체는 모두 정상 작동합니다.

## Supabase 연결

1. Supabase 새 프로젝트의 SQL Editor에서 `supabase/migrations/001_arcade_leaderboard.sql`을 실행합니다.
2. Project Settings → API의 URL과 anon key를 `.env`에 입력합니다.
3. 개발 서버를 다시 시작합니다.

이름은 기기별 UUID와 함께 브라우저에 캐시됩니다. DB에는 종목별 최고 점수, 최고 기록 시간, 플레이 횟수만 저장됩니다. 공개 클라이언트 게임이므로 SQL은 점수 범위를 검증하지만 완전한 부정 점수 방지는 서버 검증 리플레이/서명 토큰을 별도로 추가해야 합니다.

## 배포

```bash
npm run test
npm run lint
npm run build
```

- **Cloudflare Pages**: build command `npm run build`, output `dist`. `public/_redirects`가 SPA 라우팅을 처리합니다.
- **Vercel**: framework Vite, output `dist`. `vercel.json` 포함.
- 배포 프로젝트에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 등록한 뒤 `games.hajunshin.com` CNAME을 연결합니다.

## 기술 구성

React 19 · TypeScript · Vite · React Three Fiber / Three.js · Supabase

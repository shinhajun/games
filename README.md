# HAJUN ARCADE

`games.hajunshin.com`용 모바일 우선 3D 웹 아케이드입니다.

**Production:** [https://games.hajunshin.com](https://games.hajunshin.com) · **Repository:** [shinhajun/games](https://github.com/shinhajun/games)

## 게임

- **3쿠션** — 6샷 동안 수구가 두 목적구를 맞히고, 두 번째 목적구 전에 쿠션 3회 이상 접촉하면 1점
- **한국식 4구** — 6샷 동안 흰 수구로 빨간 목적구 2개를 모두 맞히면 1점, 노란 상대 수구 접촉은 파울
- **Classic Yacht** — 5개 주사위, 턴당 최대 3회 롤, 12개 원형 Yacht 카테고리의 합산 점수(최대 297점)

규칙 기준: [UMB Carom rules](https://files.umb-carom.org/Public/Rules/CAROM%20BILLIARD%20RULES.pdf), [대한당구연맹 4구 안내](https://kr.object.ncloudstorage.com/kbfdiv/2025_kbf_division.pdf.pdf), [Classic Yacht scoring](https://en.wikipedia.org/wiki/Yacht_%28dice_game%29).

## 당구 실측 규격과 물리

| 종목 | 유효 경기면 | 공 | 공 질량 | 쿠션 노즈 |
| --- | --- | --- | --- | --- |
| 3쿠션 | 국제식 대대 2,844 × 1,422 mm | Ø61.5 mm | 210 g | 37 mm |
| 한국식 4구 | 국제식 중대 2,540 × 1,270 mm | Ø65.5 mm | 255 g | 38 mm |

- 엔진 좌표는 metre–kilogram–second 단위이며 렌더링도 동일한 축척을 사용합니다.
- 균질한 구의 관성모멘트 `I = 2/5 mr²`, 공-천 접점의 미끄럼 속도, Coulomb 미끄럼 마찰, 구름 저항을 각각 계산합니다.
- 공-공 충돌은 충격량 기반으로 반발계수 `0.98`과 접선 마찰을 적용하고, 공-쿠션 충돌은 반발계수 `0.98`, 접선 마찰계수 `0.14`와 횡회전을 함께 계산합니다.
- 240 Hz 고정 물리 스텝으로 프레임률과 충돌 결과를 분리했습니다.
- 마찰 기준은 고속 촬영 실험의 미끄럼 `0.178–0.245`, 구름 `0.0127–0.0129`와 가열된 3쿠션 테이블 실측 보정값 `0.008`을 사용합니다.

물리 참고: [Dynamics in Carom and Three Cushion Billiards](https://doi.org/10.1007/BF02919180), [Application of high-speed imaging to determine the dynamics of billiards](https://doi.org/10.1119/1.3157159), [A theoretical analysis of billiard ball dynamics under cushion impacts](https://doi.org/10.1243/09544062JMES1964).

실제 테이블은 천의 마모·온습도·가열 상태·쿠션 고무와 큐의 입사각에 따라 계수가 달라집니다. 이 구현은 명시된 공인 장비와 표준 상태를 결정론적으로 재현하며, 점프·스쿼트·큐대 승강각은 아직 모델 범위에 포함하지 않습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

Supabase 환경변수가 없으면 기록은 브라우저 `localStorage`에 저장됩니다. 프로덕션은 서울 리전 Supabase 순위표에 연결되어 있습니다.

## Supabase 연결

1. Supabase 새 프로젝트의 SQL Editor에서 `supabase/migrations/20260829154000_arcade_leaderboard.sql`을 실행합니다.
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
- `main` 브랜치 push 시 GitHub Actions가 검사·빌드 후 Cloudflare Pages `games` 프로젝트에 자동 배포합니다.

## 기술 구성

React 19 · TypeScript · Vite · React Three Fiber / Three.js · Supabase

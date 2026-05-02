# BP v2 — TikCle Brand Performance Tool

Next.js 15 + Supabase + Inngest 기반의 브랜드 케이스 분석 도구.

## 기술 스택

| | 사용 |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 (CSS-first config, design tokens in `globals.css`) |
| DB | Supabase (project `dxjodlxkynjirldpumxr`) |
| Phase 실행 | Inngest 3 (background jobs, retry, event-driven) |
| External | Apify (clockworks · lemur · pro100chok · facebook-ads), Anthropic Claude |
| 파서 | papaparse (CSV) |

## 빠른 시작

```bash
cd bp_v2_app
cp .env.example .env.local
# .env.local 에 SUPABASE_SERVICE_ROLE_KEY / APIFY_TOKEN / ANTHROPIC_API_KEY 채워넣기
npm install
npm run dev
```

`http://localhost:3000` → `/cases` 로 자동 redirect.

### Inngest dev server (별도 터미널)

```bash
npx inngest-cli@latest dev
```

자동으로 `http://localhost:8288` 에서 함수 등록 + 이벤트 트리거 UI 제공.

## 디렉터리

```
src/
├── app/
│   ├── layout.tsx              # 토프바 + 사이드네비 셸
│   ├── globals.css             # 디자인 토큰 (mockup과 동일)
│   ├── cases/
│   │   ├── page.tsx           # My Cases 리스트
│   │   ├── new/page.tsx       # 새 케이스 폼
│   │   └── [id]/page.tsx      # 상세 (running / dashboard 분기)
│   └── api/inngest/route.ts   # Inngest 함수 등록 endpoint
├── components/layout/         # Topbar / Sidenav
├── lib/
│   ├── supabase/              # client.ts (browser) / server.ts / types.ts
│   ├── inngest/               # client.ts + functions/<phase>.ts
│   ├── parsers/               # CSV 파서 (exolyt / amazon-sales / bsr)
│   ├── apify/                 # actor 호출 래퍼
│   └── anthropic/             # vision tagger / clustering
```

## DB 마이그레이션

`/Users/suna/Desktop/claude/bp_v2/db/` 의 SQL 파일을 Supabase Studio SQL Editor에서 순서대로:

1. `001_refactor.sql` — brands 통합, 신규 테이블, products·contents 보강
2. `002_sales_period_and_cache.sql` — 매출 기간 + lemur 캐시 컬럼

마이그레이션 후 타입 재생성:

```bash
npx supabase login
npm run db:types
```

→ `src/lib/supabase/types.gen.ts` 가 갱신되며, `types.ts`를 그걸 re-export 하도록 바꿔주면 됨.

## 진행 단계

- [x] **Stage 1** — 프로젝트 스켈레톤, layout, supabase 클라이언트, types
- [ ] **Stage 2** — 케이스 생성 폼 + CSV 업로드 + 파싱 + DB insert
- [ ] **Stage 3** — Inngest phase 함수 1~6 (data loader → dashboard build)
- [ ] **Stage 4** — 케이스 상세 (running Stepper + ready Dashboard)
- [ ] **Stage 5** — 알림 (브라우저/슬랙/이메일)

## 참고

- 디자인 mockup: `../bp_v2/mockups/`
- DB 마이그레이션: `../bp_v2/db/`
- 외부 인플 DB (fans 룩업): `dynqedcbmanvyfdlruni.supabase.co` / `influencer_db_tt` 테이블

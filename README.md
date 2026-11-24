# 마루 중개 통합관리

토지·건물 매입 고객을 상대하는 중개법인 직원용 통합관리 웹앱입니다.
엑셀·메모장·기억에 흩어져 있던 고객, 물건, 니즈 변화, 상담 기록, 할 일을 한곳에서 관리합니다.

## 지금 되는 것 (Phase 0–1)

| 영역 | 기능 |
|---|---|
| 로그인·권한 | 직원 계정 로그인, 역할별 열람 범위 (직원: 본인 담당 고객 / 팀장: 팀원·미지정 고객까지 / 관리자: 전체). 물건은 전 직원 공유 |
| 고객 | 등록·수정, 진행 단계(신규→상담→물건 제안→임장→협상→계약→잔금, 이탈), 담당자 지정, 검색·단계별 필터 |
| 니즈 변화 트래킹 | 희망 지역·물건 종류·목적·예산·면적·용도지역을 **버전으로 저장**. 변경 사유와 함께 무엇이 어떻게 바뀌었는지 타임라인으로 표시. 바뀐 게 없으면 저장하지 않음 |
| 물건 | 토지/건물 등록·수정, 지번·지목·용도지역·면적(㎡/평)·희망가·평당가 자동 계산, 상태 관리 |
| 상담 기록 | 통화·미팅·임장·문자·메모 기록, 관련 물건 연결, 최근 연락일 자동 갱신 |
| 할 일 | 고객·물건에 연결된 할 일, 마감·담당자, 지난 마감/오늘/예정 구분 |
| 대시보드 | 파이프라인 현황, 30일 이상 미연락 고객, 내 할 일, 최근 물건 |
| 감사 로그 | 로그인(실패 포함), 고객 열람·수정, 니즈 변경 기록 (관리자 화면) |

## 다음 단계

- **Phase 2** — 고객 니즈 ↔ 물건 자동 매칭, 파이프라인 칸반, 엑셀 가져오기
- **Phase 3** — 통화 녹음 업로드 → 음성 인식(STT) → AI 요약 → 고객 기록 연결, 니즈 변경 제안, 할 일 자동 생성
- **Phase 4** — 지번으로 토지이용계획·공시지가·건축물대장·실거래가 자동 조회, 지도
- **Phase 5** — 문서함, 제안서 PDF, 계약·수수료·실적
- **Phase 6** — 모바일(PWA), 임장 사진, 알림

## 기술 스택

Next.js 16 (App Router, Server Actions) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS 4 · Vitest

## 로컬 실행

필요: Node.js 22+, PostgreSQL 14+

```bash
npm install
cp .env.example .env          # DATABASE_URL, TEST_DATABASE_URL 수정
npm run db:migrate            # 테이블 생성
npm run db:seed               # (선택) 데모 데이터
npm run dev                   # http://localhost:3000
```

데모 계정 (비밀번호 모두 `maru1234!`, **데모 전용 — 운영 DB에서는 시드를 실행하지 마세요**)

| 이메일 | 역할 |
|---|---|
| admin@maru.local | 관리자 |
| manager@maru.local | 팀장 (영업1팀) |
| agent1@maru.local | 직원 (영업1팀) |
| agent2@maru.local | 직원 (영업2팀) |

## 개발 명령

```bash
npm test            # 단위 + DB 통합 테스트 (TEST_DATABASE_URL 의 DB를 비우고 다시 만듭니다)
npm run typecheck
npm run lint
npm run build
npm run db:generate # 스키마(src/db/schema.ts) 변경 후 마이그레이션 생성
```

## 구조

```
src/
  app/
    login/                 로그인
    (app)/                 로그인 후 화면 (대시보드, customers, properties, tasks, admin)
      */actions.ts         서버 액션 — 모두 requireUser() 와 권한 확인 후 실행
  components/              공통 UI, 폼
  db/schema.ts             테이블 정의
  lib/
    auth/                  세션(해시 저장 토큰), 비밀번호(bcrypt), requireUser/requireRole
    authz.ts               열람·수정 권한 규칙 (canViewCustomer 와 SQL customerScope 가 같은 규칙)
    needs.ts               니즈 입력 파싱·버전 비교
    needs-store.ts         니즈 버전 저장 (고객 행 잠금으로 동시 저장 시 버전 충돌 방지)
    format.ts              억/만원, ㎡/평, 서울 시간 표시
drizzle/                   SQL 마이그레이션
tests/                     Vitest
```

## 운영 시 참고

- 금액은 **만원 단위 정수**, 면적은 **㎡** 로 저장합니다. 화면에서 억/만원, 평으로 바꿔 보여줍니다.
- 세션 쿠키는 httpOnly이며 DB에는 토큰의 SHA-256 해시만 저장합니다. 직원 비활성화·비밀번호 변경 시 기존 세션이 끊깁니다.
- 고객 상세를 열 때마다 감사 로그에 열람 기록이 남습니다 (개인정보 접근 추적).
- 통화 녹음 기능(Phase 3)을 붙이기 전에 고객 고지·동의, 녹음 파일 보관 기간, 외부 STT·AI 업체 처리 위탁 여부를 정해야 합니다.

-- ════════════════════════════════════════════════════════════════
--  수목 측정 앱 DB 설정 — Supabase 대시보드 > SQL Editor 에서 전체를 한 번 실행
--  · 여러 번 실행해도 안전합니다. 기존 데이터는 지워지지 않습니다.
--  · 포함: No.(tree_no)·수종(species)·초기화(archived) 칸, 저장/조회/보관 권한
-- ════════════════════════════════════════════════════════════════

-- 1) 테이블 (없을 때만 생성)
create table if not exists public.tree_measurements (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  tree_no       integer,                         -- 일련번호 (= 기초현황조사표 No.)
  species       text,                            -- 수종
  height        double precision,                -- 수고 (m)
  clear_length  double precision,                -- 지하고 (m)
  dbh           double precision,                -- 흉고직경 (cm)
  crown_width   double precision,                -- 수관폭 (m)
  azimuth       integer,                         -- 방위각 (0~359°)
  height_angle  double precision,                -- 꼭대기 조준 고도각 (°) (아이폰 AR)
  branch_angle  double precision,                -- 가지 시작점 조준 고도각 (°) (아이폰 AR)
  archived      boolean not null default false   -- true = '다운로드 후 초기화'로 보관된 기록
);

-- 2) 이미 있는 테이블에 빠진 칸 추가
alter table public.tree_measurements add column if not exists tree_no      integer;
alter table public.tree_measurements add column if not exists species      text;
alter table public.tree_measurements add column if not exists dbh          double precision;
alter table public.tree_measurements add column if not exists height_angle double precision;
alter table public.tree_measurements add column if not exists branch_angle double precision;
alter table public.tree_measurements add column if not exists archived     boolean not null default false;

-- 3) 보안(RLS) 켜기 — anon 키는 공개되는 키이므로 필요한 권한만 허용
alter table public.tree_measurements enable row level security;

-- 4) 저장·조회 허용
grant insert, select on table public.tree_measurements to anon, authenticated;

drop policy if exists "anon insert" on public.tree_measurements;
create policy "anon insert" on public.tree_measurements
  for insert to anon, authenticated with check (true);

drop policy if exists "anon read" on public.tree_measurements;
create policy "anon read" on public.tree_measurements
  for select to anon, authenticated using (true);

-- 5) 초기화(보관) 허용 — archived 칸만 false → true 로 바꿀 수 있음 (삭제·값 수정 불가)
revoke update, delete on table public.tree_measurements from anon, authenticated;
grant update (archived) on table public.tree_measurements to anon, authenticated;

drop policy if exists "anon archive" on public.tree_measurements;
create policy "anon archive" on public.tree_measurements
  for update to anon, authenticated using (archived = false) with check (archived = true);

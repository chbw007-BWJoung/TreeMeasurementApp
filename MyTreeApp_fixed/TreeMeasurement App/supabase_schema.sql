-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.
-- 앱(웹/아이폰)이 저장하는 컬럼과 정확히 일치해야 insert가 성공합니다.

create table if not exists public.tree_measurements (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  height        double precision,   -- 수고 (m)
  clear_length  double precision,   -- 지하고 (m)
  dbh           double precision,   -- 흉고직경 (cm)
  crown_width   double precision,   -- 수관폭 (m)
  azimuth       integer,            -- 방위각 (0~359°)
  height_angle  double precision,   -- 꼭대기 조준 고도각 (°)  (아이폰 AR 측정 시)
  branch_angle  double precision    -- 가지 시작점 조준 고도각 (°) (아이폰 AR 측정 시)
);

-- 이미 테이블이 있는데 dbh 등 컬럼이 없다면:
alter table public.tree_measurements add column if not exists dbh double precision;
alter table public.tree_measurements add column if not exists height_angle double precision;
alter table public.tree_measurements add column if not exists branch_angle double precision;

-- RLS(행 수준 보안): anon 키는 공개되는 키이므로 RLS를 켜고 필요한 권한만 허용합니다.
alter table public.tree_measurements enable row level security;

drop policy if exists "anon insert" on public.tree_measurements;
create policy "anon insert" on public.tree_measurements
  for insert to anon with check (true);

drop policy if exists "anon read" on public.tree_measurements;
create policy "anon read" on public.tree_measurements
  for select to anon using (true);

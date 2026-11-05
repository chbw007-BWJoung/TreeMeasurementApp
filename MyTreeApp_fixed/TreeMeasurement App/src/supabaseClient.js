import { createClient } from '@supabase/supabase-js'

// ▼▼▼ 여기 두 줄만 바꾸면 됩니다 (따옴표 안에, 줄바꿈 없이 한 줄로) ▼▼▼
const DEFAULT_URL = 'https://ljhrhnbdqekitetzjrck.supabase.co'
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaHJobmJkcWVraXRldHpqcmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NjMyNzIsImV4cCI6MjEwOTQzOTI3Mn0.WyHD7ng1ciGB-xTayNUGFryCRg2bRPjMLSxiUuughYg
'
// ▲▲▲

// Netlify 환경 변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 있으면 그 값을 우선 사용합니다.
// 붙여넣을 때 섞여 들어간 공백·줄바꿈·끝의 '/'는 자동으로 제거합니다.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY).replace(/\s+/g, '')

// 설정이 잘못돼도 앱 전체가 멈추지(검은 화면) 않도록, 오류를 잡아 화면에 표시합니다.
export let supabase = null
export let configError = ''

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  configError = `Supabase URL 형식이 잘못되었습니다: "${SUPABASE_URL}" — https://xxxx.supabase.co 형태여야 합니다.`
} else if (!SUPABASE_ANON_KEY.startsWith('eyJ') && !SUPABASE_ANON_KEY.startsWith('sb_publishable_')) {
  configError = 'anon key 형식이 잘못되었습니다. Project Settings → API의 anon public 키(eyJ… 또는 sb_publishable_…)를 넣으세요.'
} else {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  } catch (e) {
    configError = 'Supabase 연결 설정 오류: ' + (e?.message ?? String(e))
  }
}

import { createClient } from '@supabase/supabase-js'

// 프로젝트 ref만 넣으면 안 되고, 전체 URL(https://<ref>.supabase.co)이 필요합니다.
// .env 파일(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)이 있으면 그 값을 우선 사용합니다.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vuaxszhuitlsivihucfu.supabase.co'

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YXhzemh1aXRsc2l2aWh1Y2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTAyOTEsImV4cCI6MjEwNzYyNjI5MX0.Z8gww-w8kCC7GQcl83FZ1zx2blcfDltOocRcxPj3dTw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

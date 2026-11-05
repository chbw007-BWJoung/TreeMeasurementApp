import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ljhrhnbdqekitetzjrck.netlify.app'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaHJobmJkcWVraXRldHpqcmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NjMyNzIsImV4cCI6MjEwOTQzOTI3Mn0.WyHD7ng1ciGB-xTayNUGFryCRg2bRPjMLSxiUuughYg
'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

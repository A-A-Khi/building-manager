import { createClient } from '@supabase/supabase-js';

// قراءة المتغيرات من ملف الـ .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// إنشاء نسخة الربط وتصديرها
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
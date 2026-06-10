import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 로컬 개발 환경에서만 .env 파일 로드 (Vercel에선 무시됨)
load_dotenv()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_ANON_KEY = (os.getenv("SUPABASE_ANON_KEY") or "").strip()

supabase: Client = None

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("⚠️ 경고: SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다.")
else:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    except Exception as e:
        print(f"⚠️ Supabase 클라이언트 초기화 오류: {e}")

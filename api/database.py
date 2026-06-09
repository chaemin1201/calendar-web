import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 🌟 현재 database.py 위치에서 한 단계 위(WEB)에 있는 .env 파일 지정
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
dotenv_path = os.path.join(parent_dir, '.env')

load_dotenv(dotenv_path=dotenv_path)

# 환경 변수 초기화 및 공백 제거(strip) 미리 처리
# os.getenv()가 None을 반환하면 빈 문자열("")을 기본값으로 사용합니다.
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_ANON_KEY = (os.getenv("SUPABASE_ANON_KEY") or "").strip()

# 초기화용 전역 변수 선언
supabase: Client = None

# ⚠️ 환경 변수가 제대로 입력되었을 때만 클라이언트를 생성합니다.
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("\n" + "="*60)
    print("⚠️ 경고: .env 파일 위치를 찾지 못했거나 내부 변수가 누락되었습니다.")
    print("FastAPI는 구동되나 Supabase 관련 DB/Storage API 호출 시 에러가 발생합니다.")
    print("="*60 + "\n")
else:
    try:
        # 안전하게 전역 Supabase 클라이언트 객체 생성
        supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    except Exception as e:
        print(f"⚠️ Supabase 클라이언트 초기화 중 오류 발생: {e}")
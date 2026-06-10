import io
import json
import os
import random
from datetime import datetime
from typing import List, Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client

from api.database import supabase

load_dotenv()

# Gemini AI 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("⚠️ 경고: .env 파일에 GEMINI_API_KEY가 설정되지 않았습니다.")

# Supabase Storage 클라이언트 설정
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase_client: Client = create_client(SUPABASE_URL.strip(), SUPABASE_ANON_KEY.strip())
else:
    print("⚠️ 경고: Storage 연동을 위한 SUPABASE_URL 또는 SUPABASE_ANON_KEY가 설정되지 않았습니다.")

app = FastAPI(redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def delete_storage_file(public_url: Optional[str]):
    """Supabase Public URL을 분석하여 스토리지 버킷 내부의 실제 파일을 삭제합니다."""
    if not public_url or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return
    
    if "uploaded_images/" in public_url:
        filename = public_url.split("uploaded_images/")[-1]
        try:
            supabase_client.storage.from_("uploaded_images").remove([filename])
        except Exception as e:
            print(f"⚠️ Supabase 스토리지 파일 삭제 중 실패: {e}")


# ==========================================
# 📑 Pydantic 데이터 모델 정의 영역
# ==========================================
class RoomCreate(BaseModel):
    room_name: str

class NoticeCreate(BaseModel):
    content: str
    writer: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ChatCreate(BaseModel):
    content: str
    writer: str
    color_code: str

class ExtractedSchedule(BaseModel):
    title: str = Field(description="추출된 일정 핵심 제목 (예: 알고리즘 과제 제출)")
    date_str: str = Field(description="월-일 정보를 MM-DD 형식으로 작성 (예: 06-15)")
    time_str: str = Field(description="시간 정보를 HH:MM 형식으로 작성 (예: 14:30)")

class ExtractedScheduleList(BaseModel):
    schedules: List[ExtractedSchedule]

class ScheduleMove(BaseModel):
    event_time: str

class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    memo: Optional[str] = None

class SubScheduleCreate(BaseModel):
    user_name: str
    color_code: str
    available_time: str
    note: Optional[str] = None

class UserJoin(BaseModel):
    user_name: str
    color_code: str


# ==========================================
# 🏠 Room & Users API
# ==========================================
@app.post("/api/rooms/")
def create_room(room: RoomCreate):
    room_code = str(random.randint(100000, 999999))
    
    response = supabase.table("room").insert({
        "room_id": room_code,
        "room_name": room.room_name
    }).execute()
    
    return {"room_code": room_code, "data": response.data}

@app.post("/api/rooms/{room_id}/join")
def join_room(room_id: str, payload: UserJoin):
    existing_color = supabase.table("user") \
        .select("*") \
        .eq("room_id", room_id) \
        .eq("color_code", payload.color_code) \
        .execute()
        
    if existing_color.data:
        raise HTTPException(status_code=400, detail="이미 다른 팀원이 사용 중인 색상입니다. 다른 색상을 선택해주세요.")

    response = supabase.table("user").insert({
        "room_id": room_id,
        "user_name": payload.user_name,
        "color_code": payload.color_code,
    }).execute()
    
    if not response.data:
        raise HTTPException(status_code=400, detail="방 참여에 실패했습니다.")
        
    return {"user_name": payload.user_name, "color_code": payload.color_code}

@app.get("/api/rooms/{room_id}")
def get_room_info(room_id: str):
    response = supabase.table("room").select("*").eq("room_id", room_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="존재하지 않는 방입니다.")
    return response.data[0]

@app.get("/api/rooms/{room_id}/users")
def get_room_users(room_id: str):
    response = supabase.table("user").select("*").eq("room_id", room_id).execute()
    return response.data

@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str):
    room_check = supabase.table("room").select("*").eq("room_id", room_id).execute()
    if not room_check.data:
        raise HTTPException(status_code=404, detail="방이 존재하지 않습니다.")

    schedules_res = supabase.table("schedule").select("id, image_url, memo_file_url").eq("room_id", room_id).execute()

    # 🌟 [보완] 종속 관계 외래키 해결을 위한 단계별 순차 역순 정리
    try:
        if schedules_res.data:
            sch_ids = [s["id"] for s in schedules_res.data]
            if sch_ids:
                supabase.table("subschedule").delete().in_("schedule_id", sch_ids).execute()
                supabase.table("chat").delete().in_("schedule_id", sch_ids).execute()
        
        supabase.table("chat").delete().eq("room_id", room_id).execute()
        supabase.table("notice").delete().eq("room_id", room_id).execute()
        supabase.table("user").delete().eq("room_id", room_id).execute()
        supabase.table("schedule").delete().eq("room_id", room_id).execute()
        supabase.table("room").delete().eq("room_id", room_id).execute()
    except Exception as e:
        print(f"⚠️ 방 연쇄 삭제 중 에러 발생: {e}")

    if schedules_res.data:
        for sch in schedules_res.data:
            if sch.get("image_url"):
                delete_storage_file(sch.get("image_url"))
            if sch.get("memo_file_url"):
                delete_storage_file(sch.get("memo_file_url"))
    
    return {
        "status": "success",
        "message": "방과 연관된 모든 데이터 및 클라우드 업로드 파일이 완전히 정리되었습니다.",
    }

@app.delete("/api/rooms/{room_id}/users/{user_id}")
def leave_user(room_id: str, user_id: int):
    user_check = supabase.table("user").select("*").eq("id", user_id).eq("room_id", room_id).execute()
    if not user_check.data:
        raise HTTPException(status_code=404, detail="해당 방에 존재하지 않는 사용자입니다.")

    user_name = user_check.data[0]["user_name"]

    try:
        supabase.table("subschedule").delete().eq("user_name", user_name).execute()
    except Exception as e:
        print(f"⚠️ subschedule 삭제 중 예외 발생: {e}")

    supabase.table("user").delete().eq("id", user_id).execute()
    
    return {
        "status": "success",
        "message": f"{user_name}님이 방에서 나갔습니다. 참여 목록과 시간표만 정리되었고 작성한 채팅은 유지됩니다.",
    }


# ==========================================
# 📢 Notice API
# ==========================================
@app.get("/api/rooms/{room_id}/notices")
def get_notices(room_id: str):
    response = supabase.table("notice").select("*").eq("room_id", room_id).order("id", desc=True).execute()
    return response.data

@app.post("/api/rooms/{room_id}/notices")
def create_notice(room_id: str, notice: NoticeCreate):
    supabase.table("notice").insert({
        "room_id": room_id,
        "content": notice.content,
        "writer": notice.writer,
        "start_date": notice.start_date,
        "end_date": notice.end_date,
    }).execute()
    return {"status": "success"}

@app.delete("/api/notices/{notice_id}")
def delete_notice(notice_id: int):
    notice_check = supabase.table("notice").select("*").eq("id", notice_id).execute()
    if not notice_check.data:
        raise HTTPException(status_code=404, detail="공지사항이 존재하지 않습니다.")
        
    supabase.table("notice").delete().eq("id", notice_id).execute()
    return {"status": "success", "message": "공지사항이 삭제되었습니다."}


# ==========================================
# 💬 Global Open Chat API
# ==========================================
@app.get("/api/rooms/{room_id}/chats")
def get_chats(room_id: str):
    response = supabase.table("chat").select("*").eq("room_id", room_id).is_("schedule_id", "null").execute()
    return response.data

@app.post("/api/rooms/{room_id}/chats")
def create_chat(room_id: str, chat: ChatCreate):
    supabase.table("chat").insert({
        "room_id": room_id,
        "schedule_id": None,
        "content": chat.content,
        "writer": chat.writer,
        "color_code": chat.color_code,
    }).execute()
    return {"status": "success"}


# ==========================================
# 📅 Schedules Main API
# ==========================================
@app.get("/api/rooms/{room_id}/schedules")
def get_room_schedules(room_id: str):
    response = supabase.table("schedule").select("*").eq("room_id", room_id).execute()
    return response.data

@app.post("/api/rooms/{room_id}/schedules/manual")
async def create_schedule_manual(
    room_id: str,
    title: str = Form(...),
    date_str: str = Form(...),
    time_str: str = Form(...),
    color_code: str = Form(...),
    file: Optional[UploadFile] = File(None),
):
    image_public_url = None
    if file and file.filename and SUPABASE_URL and SUPABASE_ANON_KEY:
        random_prefix = random.randint(1000, 9999)
        clean_filename = f"{random_prefix}_{file.filename.replace(' ', '_')}"
        try:
            file_bytes = await file.read()
            supabase_client.storage.from_("uploaded_images").upload(
                path=clean_filename,
                file=file_bytes,
                file_options={"content-type": file.content_type}
            )
            image_public_url = supabase_client.storage.from_("uploaded_images").get_public_url(clean_filename)
        except Exception as e:
            print(f"⚠️ Supabase 이미지 스토리지 업로드 실패: {e}")

    response = supabase.table("schedule").insert({
        "room_id": room_id,
        "title": title,
        "event_date": date_str,
        "event_time": time_str,
        "color_code": color_code,
        "image_url": image_public_url,
        "memo": "",
    }).execute()
    
    return response.data[0] if response.data else {}

@app.patch("/api/schedules/{schedule_id}/move")
def move_schedule(schedule_id: int, payload: ScheduleMove):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    supabase.table("schedule").update({"event_time": payload.event_time}).eq("id", schedule_id).execute()
    return {"status": "success"}

@app.patch("/api/schedules/{schedule_id}")
def update_schedule_details(schedule_id: int, payload: ScheduleUpdate):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    update_data = {}
    if payload.title is not None: update_data["title"] = payload.title
    if payload.event_date is not None: update_data["event_date"] = payload.event_date
    if payload.event_time is not None: update_data["event_time"] = payload.event_time
    if payload.memo is not None: update_data["memo"] = payload.memo

    if update_data:
        supabase.table("schedule").update(update_data).eq("id", schedule_id).execute()
        
    return {"status": "success", "message": "일정 정보 및 메모가 수정되었습니다."}

@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch = sch_check.data[0]

    # 자식 테이블 선제거로 무결성 충돌 회피
    try:
        supabase.table("subschedule").delete().eq("schedule_id", schedule_id).execute()
        supabase.table("chat").delete().eq("schedule_id", schedule_id).execute()
    except Exception as e:
        print(f"⚠️ 하위 일정/채팅 데이터 정리 실패(무시가능): {e}")

    supabase.table("schedule").delete().eq("id", schedule_id).execute()
    
    delete_storage_file(sch.get("image_url"))
    delete_storage_file(sch.get("memo_file_url"))

    return {
        "status": "success",
        "message": "일정과 연관된 모든 파일이 완전히 삭제되었습니다.",
    }


# ==========================================
# 🔍 Popup Tabs API & AI OCR API
# ==========================================
@app.post("/api/rooms/{room_id}/schedules/ai")
async def create_schedule_ai(
    room_id: str,
    color_code: str = Form(...),
    file: UploadFile = File(...),
):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=500, detail="서버의 .env에 API 키가 설정되지 않았습니다."
        )

    try:
        random_prefix = random.randint(1000, 9999)
        clean_filename = f"{random_prefix}_{file.filename.replace(' ', '_')}"

        image_bytes = await file.read()
        image_public_url = None

        if SUPABASE_URL and SUPABASE_ANON_KEY:
            try:
                supabase_client.storage.from_("uploaded_images").upload(
                    path=clean_filename,
                    file=image_bytes,
                    file_options={"content-type": file.content_type}
                )
                image_public_url = supabase_client.storage.from_("uploaded_images").get_public_url(clean_filename)
            except Exception as e:
                print(f"⚠️ AI 이미지 스토리지 업로드 실패: {e}")

        now = datetime.now()
        current_date_str = now.strftime("%m-%d")
        current_time_str = now.strftime("%H:%M")
        current_date_friendly = now.strftime("%m월 %d일")
        current_time_friendly = now.strftime("%H시 %M분")

        model = genai.GenerativeModel("gemini-2.5-flash")
        image_parts = [{"mime_type": file.content_type, "data": image_bytes}]

        prompt = f"""
        이 이미지에 포함된 모든 일정(시간표, 공지사항, 안내문 등)을 분석해서 빠짐없이 JSON 형식으로 반환해줘.

        ※ 기준 정보 및 유의사항:
        - 현재 날짜는 {current_date_friendly} 이고, 현재 시간은 {current_time_friendly} 야.
        - 만약 이미지에 '내일'이나 '요일'만 적혀있다면 이 기준 정보를 바탕으로 날짜를 정확히 계산해줘.
        - 이미지에 날짜 정보가 전혀 없다면 기본값으로 현재 날짜인 "{current_date_str}"을 채워줘.
        - 이미지에 시간 정보가 전혀 없다면 기본값으로 현재 시간인 "{current_time_str}" 또는 "12:00"으로 채워줘.
        """

        response = model.generate_content(
            [prompt, image_parts[0]],
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": ExtractedScheduleList,
            }
        )
        
        raw_text = response.text.strip()

        try:
            parsed_json = json.loads(raw_text)
            parsed_data = parsed_json.get("schedules", [])
        except Exception:
            parsed_data = [
                {
                    "title": "사진 업로드 자동 일정",
                    "date_str": current_date_str,
                    "time_str": current_time_str,
                }
            ]

        inserted_schedules = []

        for item in parsed_data:
            insert_res = supabase.table("schedule").insert({
                "room_id": room_id,
                "title": item.get("title", "새로운 일정"),
                "event_date": item.get("date_str", current_date_str),
                "event_time": item.get("time_str", current_time_str),
                "color_code": color_code,
                "image_url": image_public_url,
                "memo": "",
            }).execute()
            if insert_res.data:
                inserted_schedules.append(insert_res.data[0])

        return {
            "status": "success",
            "schedules": [
                {
                    "id": sch.get("id"),
                    "title": sch.get("title"),
                    "event_date": sch.get("event_date"),
                    "event_time": sch.get("event_time"),
                }
                for sch in inserted_schedules
            ],
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI 이미지 분석 및 바로 등록 중 오류가 발생했습니다: {str(e)}",
        )


# 🌟 [수정 완료] 자동 저장 디바운스 및 파일 업로드 시 파일 종속성 버그 완벽 방어 API
@app.patch("/api/schedules/{schedule_id}/memo")
async def update_schedule_memo(
    schedule_id: int,
    memo: str = Form(""), # 🌟 빈 문자열 허용하여 422 에러 완벽 방어
    file: Optional[UploadFile] = File(None),
):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch = sch_check.data[0]
    memo_file_url = sch.get("memo_file_url")

    if file and file.filename and SUPABASE_URL and SUPABASE_ANON_KEY:
        if memo_file_url:
            delete_storage_file(memo_file_url)

        random_prefix = random.randint(1000, 9999)
        clean_filename = f"memo_{random_prefix}_{file.filename.replace(' ', '_')}"

        # 🌟 PDF, HWP 확장자를 안정적으로 매핑하기 위한 Content-Type 분기
        content_type = file.content_type
        lower_filename = file.filename.lower()
        if lower_filename.endswith('.pdf'):
            content_type = "application/pdf"
        elif lower_filename.endswith('.hwp'):
            content_type = "application/x-hwp"
        elif not content_type:
            content_type = "application/octet-stream"

        try:
            file_bytes = await file.read()

            print("📤 업로드 시작:", file.filename)

            result = supabase_client.storage.from_("uploaded_images").upload(
                path=clean_filename,
                file=file_bytes,
                file_options={"content-type": content_type}
            )

            print("✅ 업로드 결과:", result)

            memo_file_url = supabase_client.storage.from_("uploaded_images").get_public_url(clean_filename)

            print("🔗 생성된 URL:", memo_file_url)
        except Exception as e:
            import traceback
            traceback.print_exc()

    final_memo = memo if memo.strip() else sch.get("memo", "")

    response = supabase.table("schedule").update({
        "memo": memo,
        "memo_file_url": memo_file_url
    }).eq("id", schedule_id).execute()

    print("업데이트 응답:", response.data)

    return {
        "status": "updated",
        "id": schedule_id,
        "memo": memo,
        "memo_file_url": memo_file_url
    }
# 🌟 [추가] 방 하위 일정 메모 업데이트 전용 라우터 (이게 없어서 프론트가 방황하는 중입니다)
@app.patch("/api/rooms/{room_id}/schedules/{schedule_id}/memo")
async def update_room_schedule_memo(
    room_id: str,
    schedule_id: int,
    memo: str = Form(""),
    file: Optional[UploadFile] = File(None),
):
    # 기존 update_schedule_memo 로직을 그대로 복사해서 사용하면 됩니다.
    # 단, room_id는 여기선 쓰이지 않으므로 무시해도 됩니다.
    return await update_schedule_memo(schedule_id, memo, file)

@app.get("/api/schedules/{schedule_id}/sub-schedules")
def get_sub_schedules(schedule_id: int):
    response = supabase.table("subschedule").select("*").eq("schedule_id", schedule_id).execute()
    return response.data

@app.post("/api/schedules/{schedule_id}/sub-schedules")
def create_sub_schedule(schedule_id: int, sub: SubScheduleCreate):
    response = supabase.table("subschedule").insert({
        "schedule_id": schedule_id,
        "user_name": sub.user_name,
        "color_code": sub.color_code,
        "available_time": sub.available_time,
        "note": sub.note,
    }).execute()
    
    return response.data[0] if response.data else {}


# 🌟 [신규 추가] 프론트엔드의 공석 조율 On/Off 토글 해제를 위한 단일 서브 일정 삭제 API
@app.delete("/api/sub-schedules/{sub_id}")
def delete_single_sub_schedule(sub_id: int):
    """사용자가 선택했던 공석 시간 셀을 다시 클릭하여 해제(OFF)할 때 호출되는 API"""
    sub_check = supabase.table("subschedule").select("*").eq("id", sub_id).execute()
    if not sub_check.data:
        raise HTTPException(status_code=404, detail="해당 공석 시간 정보가 존재하지 않습니다.")
        
    supabase.table("subschedule").delete().eq("id", sub_id).execute()
    return {"status": "success", "message": "공석 조율 시간이 취소되었습니다."}


@app.get("/api/schedules/{schedule_id}/chats")
def get_schedule_chats(schedule_id: int):
    response = supabase.table("chat").select("*").eq("schedule_id", schedule_id).execute()
    return response.data

@app.post("/api/schedules/{schedule_id}/chats")
def create_schedule_chat(schedule_id: int, chat: ChatCreate):
    supabase.table("chat").insert({
        "schedule_id": schedule_id,
        "content": chat.content,
        "writer": chat.writer,
        "color_code": chat.color_code,
    }).execute()
    return {"status": "success"}


# ==========================================
# 🌟 일정 내부 이미지/파일만 개별 삭제하는 전용 API
# ==========================================
@app.delete("/api/schedules/{schedule_id}/image")
def delete_schedule_main_image(schedule_id: int):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch = sch_check.data[0]
    if sch.get("image_url"):
        supabase.table("schedule").update({"image_url": None}).eq("id", schedule_id).execute()
        delete_storage_file(sch.get("image_url"))
        
    return {"status": "success", "message": "일정 메인 이미지가 삭제되었습니다."}

@app.delete("/api/schedules/{schedule_id}/memo-file")
def delete_schedule_memo_file(schedule_id: int):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch = sch_check.data[0]
    if sch.get("memo_file_url"):
        supabase.table("schedule").update({"memo_file_url": None}).eq("id", schedule_id).execute()
        delete_storage_file(sch.get("memo_file_url"))
        
    return {"status": "success", "message": "메모 첨부파일이 삭제되었습니다."}
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

# 🌟 Gemini 구조화된 출력을 위한 Pydantic 모델 추가
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
    response = supabase.table("user").insert({
        "room_id": room_id,
        "user_name": payload.user_name,
        "color_code": payload.color_code,
    }).execute()
    
    if not response.data:
        raise HTTPException(status_code=400, detail="방 참여에 실패했습니다.")
        
    return {"user_name": payload.user_name, "color_code": payload.color_code}


@app.get("/api/rooms/{room_id}/users")
def get_room_users(room_id: str):
    response = supabase.table("user").select("*").eq("room_id", room_id).execute()
    return response.data


@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str):
    room_check = supabase.table("room").select("*").eq("room_id", room_id).execute()
    if not room_check.data:
        raise HTTPException(status_code=404, detail="방이 존재하지 않습니다.")

    # 1. 스토리지 파일 추적을 위해 일정 데이터 미리 확보
    schedules_res = supabase.table("schedule").select("image_url, memo_file_url").eq("room_id", room_id).execute()

    # 2. DB에서 방 삭제 (On Delete Cascade가 안 되어 있을 경우를 대비해 수동으로 지우거나 외래키 설정을 확인하세요)
    # 여기서는 DB 데이터 무결성을 위해 DB를 먼저 지우거나 연쇄 삭제를 유도합니다.
    supabase.table("room").delete().eq("room_id", room_id).execute()

    # 3. DB 삭제 성공 후 실제 파일 버킷에서 정리 (안전한 리소스 해제)
    for sch in schedules_res.data:
        delete_storage_file(sch.get("image_url"))
        delete_storage_file(sch.get("memo_file_url"))
    
    return {
        "status": "success",
        "message": "방과 클라우드에 업로드된 모든 파일이 완전히 삭제되었습니다.",
    }


@app.delete("/api/rooms/{room_id}/users/{user_id}")
def leave_user(room_id: str, user_id: int):
    user_check = supabase.table("user").select("*").eq("id", user_id).eq("room_id", room_id).execute()
    if not user_check.data:
        raise HTTPException(status_code=404, detail="해당 방에 존재하지 않는 사용자입니다.")

    user_name = user_check.data[0]["user_name"]

    # 사용자가 작성한 채팅 내역의 연결성 처리 (부모 키 탈퇴 시 처리)
    supabase.table("chat").update({"user_id": None}).eq("writer", user_name).eq("room_id", room_id).execute()
    supabase.table("user").delete().eq("id", user_id).execute()
    
    return {
        "status": "success",
        "message": f"{user_name}님이 방에서 나갔습니다.",
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
    # 🌟 schedule_id가 null인 전역 채팅만 필터링할 때, Supabase에서는 .is_("schedule_id", "null") 형식이 맞습니다.
    response = supabase.table("chat").select("*").eq("room_id", room_id).is_("schedule_id", "null").execute()
    return response.data


@app.post("/api/rooms/{room_id}/chats")
def create_chat(room_id: str, chat: ChatCreate):
    supabase.table("chat").insert({
        "room_id": room_id,
        "room_id": room_id,
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

    # DB 테이블을 먼저 지우고 성공하면 스토리지를 비웁니다.
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

        # 🌟 구조화된 응답을 위해 모델 객체 생성 및 config 설정 수정
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

        # 🌟 response_schema 옵션을 활용해 완벽한 형식의 JSON 강제 빌드
        response = model.generate_content(
            [prompt, image_parts[0]],
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": ExtractedScheduleList,
            }
        )
        
        raw_text = response.text.strip()

        try:
            # 안전하게 구조화된 데이터를 pydantic 구조를 경유해 파싱
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


@app.patch("/api/schedules/{schedule_id}/memo")
async def update_schedule_memo(
    schedule_id: int,
    memo: str = Form(...),
    file: Optional[UploadFile] = File(None),
):
    sch_check = supabase.table("schedule").select("*").eq("id", schedule_id).execute()
    if not sch_check.data:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch = sch_check.data[0]
    memo_file_url = sch.get("memo_file_url")

    if file and file.filename and SUPABASE_URL and SUPABASE_ANON_KEY:
        # 구 파일 삭제 후 교체
        delete_storage_file(memo_file_url)

        random_prefix = random.randint(1000, 9999)
        clean_filename = f"memo_{random_prefix}_{file.filename.replace(' ', '_')}"

        try:
            file_bytes = await file.read()
            supabase_client.storage.from_("uploaded_images").upload(
                path=clean_filename,
                file=file_bytes,
                file_options={"content-type": file.content_type}
            )
            memo_file_url = supabase_client.storage.from_("uploaded_images").get_public_url(clean_filename)
        except Exception as e:
            print(f"⚠️ 메모 파일 클라우드 스토리지 저장 실패: {e}")

    response = supabase.table("schedule").update({
        "memo": memo,
        "memo_file_url": memo_file_url
    }).eq("id", schedule_id).execute()
    
    updated_sch = response.data[0] if response.data else {}
    return {
        "status": "updated",
        "memo": updated_sch.get("memo"),
        "memo_file_url": updated_sch.get("memo_file_url"),
    }


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


@app.get("/api/schedules/{schedule_id}/chats")
def get_schedule_chats(schedule_id: int):
    response = supabase.table("chat").select("*").eq("schedule_id", schedule_id).execute()
    return response.data


@app.post("/api/schedules/{schedule_id}/chats")
def create_schedule_chat(schedule_id: int, chat: ChatCreate):
    # 🌟 일정 내부 채팅이므로 저장 시 schedule_id 명시적으로 매핑
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
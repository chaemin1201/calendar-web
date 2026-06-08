import io
import json
import os
import random
from datetime import datetime
from typing import Optional

# .env 및 외부 라이브러리 추가
import google.generativeai as genai
import database as db  # 🌟 수정된 database.py 임포트
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session  # 🌟 데이터베이스 세션 타입용
from supabase import create_client, Client

load_dotenv()

# Gemini AI 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("⚠️ 경고: .env 파일에 GEMINI_API_KEY가 설정되지 않았습니다.")

# 🌟 Supabase Storage 클라이언트 설정
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
else:
    print("⚠️ 경고: Storage 연동을 위한 SUPABASE_URL 또는 SUPABASE_ANON_KEY가 설정되지 않았습니다.")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ❌ 기존 UPLOAD_DIR 및 app.mount 로컬 폴더 관련 코드 삭제 (서버리스 환경 최적화)

# 서버 시작 시 Supabase 테이블 생성/검증
db.create_tables()


# ==========================================
# 🛠️ 🌟 Supabase 스토리지 실제 파일 삭제 함수
# ==========================================
def delete_storage_file(public_url: Optional[str]):
    """Supabase Public URL을 분석하여 스토리지 버킷 내부의 실제 파일을 삭제합니다."""
    if not public_url:
        return
    
    # URL에서 파일명만 추출 (예: .../storage/v1/object/public/uploaded_images/파일명)
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
    note: str = None


class MemoUpdate(BaseModel):
    memo: str


class UserJoin(BaseModel):
    user_name: str
    color_code: str


# ==========================================
# 🏠 Room & Users API
# ==========================================
@app.post("/api/rooms/")
def create_room(room: RoomCreate, db_session: Session = Depends(db.get_db)):
    while True:
        room_code = f"{random.randint(100000, 999999)}"
        existing = (
            db_session.query(db.Room).filter(db.Room.room_id == room_code).first()
        )
        if not existing:
            break

    new_room = db.Room(room_id=room_code, room_name=room.room_name)
    db_session.add(new_room)
    db_session.commit()
    return {"room_code": room_code, "room_name": room.room_name}


@app.post("/api/rooms/{room_id}/join")
def join_room(
    room_id: str, payload: UserJoin, db_session: Session = Depends(db.get_db)
):
    user = db.User(
        room_id=room_id,
        user_name=payload.user_name,
        color_code=payload.color_code,
    )
    db_session.add(user)
    db_session.commit()
    return {"user_name": user.user_name, "color_code": user.color_code}


@app.get("/api/rooms/{room_id}/users")
def get_room_users(room_id: str, db_session: Session = Depends(db.get_db)):
    return db_session.query(db.User).filter(db.User.room_id == room_id).all()


@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str, db_session: Session = Depends(db.get_db)):
    room = db_session.query(db.Room).filter(db.Room.room_id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="방이 존재하지 않습니다.")

    # 1. 🌟 DB에서 지워지기 전에 Supabase 클라우드 스토리지 파일들 먼저 영구 삭제
    schedules = (
        db_session.query(db.Schedule).filter(db.Schedule.room_id == room_id).all()
    )
    for sch in schedules:
        delete_storage_file(sch.image_url)
        delete_storage_file(sch.memo_file_url)

    # 2. 자동 연쇄 삭제 실행
    db_session.delete(room)
    db_session.commit()
    return {
        "status": "success",
        "message": "방과 클라우드에 업로드된 모든 파일이 완전히 삭제되었습니다.",
    }


@app.delete("/api/rooms/{room_id}/users/{user_id}")
def leave_user(
    room_id: str, user_id: int, db_session: Session = Depends(db.get_db)
):
    user = (
        db_session.query(db.User)
        .filter(db.User.id == user_id, db.User.room_id == room_id)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=404, detail="해당 방에 존재하지 않는 사용자입니다."
        )

    user_chats = (
        db_session.query(db.Chat)
        .filter(db.Chat.writer == user.user_name, db.Chat.room_id == room_id)
        .all()
    )
    for chat in user_chats:
        chat.user_id = None

    db_session.delete(user)
    db_session.commit()
    return {
        "status": "success",
        "message": f"{user.user_name}님이 방에서 나갔습니다.",
    }


# ==========================================
# 📢 Notice API
# ==========================================
@app.get("/api/rooms/{room_id}/notices")
def get_notices(room_id: str, db_session: Session = Depends(db.get_db)):
    return (
        db_session.query(db.Notice)
        .filter(db.Notice.room_id == room_id)
        .order_by(db.Notice.id.desc())
        .all()
    )


@app.post("/api/rooms/{room_id}/notices")
def create_notice(
    room_id: str, notice: NoticeCreate, db_session: Session = Depends(db.get_db)
):
    new_notice = db.Notice(
        room_id=room_id,
        content=notice.content,
        writer=notice.writer,
        start_date=notice.start_date,
        end_date=notice.end_date,
    )
    db_session.add(new_notice)
    db_session.commit()
    return {"status": "success"}


@app.delete("/api/notices/{notice_id}")
def delete_notice(notice_id: int, db_session: Session = Depends(db.get_db)):
    notice = (
        db_session.query(db.Notice).filter(db.Notice.id == notice_id).first()
    )
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항이 존재하지 않습니다.")
    db_session.delete(notice)
    db_session.commit()
    return {"status": "success", "message": "공지사항이 삭제되었습니다."}


# ==========================================
# 💬 Global Open Chat API
# ==========================================
@app.get("/api/rooms/{room_id}/chats")
def get_chats(room_id: str, db_session: Session = Depends(db.get_db)):
    return db_session.query(db.Chat).filter(db.Chat.room_id == room_id).all()


@app.post("/api/rooms/{room_id}/chats")
def create_chat(
    room_id: str, chat: ChatCreate, db_session: Session = Depends(db.get_db)
):
    new_chat = db.Chat(
        room_id=room_id,
        content=chat.content,
        writer=chat.writer,
        color_code=chat.color_code,
    )
    db_session.add(new_chat)
    db_session.commit()
    return {"status": "success"}


# ==========================================
# 📅 Schedules Main API
# ==========================================
@app.get("/api/rooms/{room_id}/schedules")
def get_room_schedules(room_id: str, db_session: Session = Depends(db.get_db)):
    return (
        db_session.query(db.Schedule).filter(db.Schedule.room_id == room_id).all()
    )


@app.post("/api/rooms/{room_id}/schedules/manual")
async def create_schedule_manual(
    room_id: str,
    title: str = Form(...),
    date_str: str = Form(...),
    time_str: str = Form(...),
    color_code: str = Form(...),
    file: Optional[UploadFile] = File(None),
    db_session: Session = Depends(db.get_db),
):
    # 🌟 1. 수동 등록 이미지 Supabase Storage 업로드 로직으로 교체
    image_public_url = None
    if file and file.filename:
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

    new_schedule = db.Schedule(
        room_id=room_id,
        title=title,
        event_date=date_str,
        event_time=time_str,
        color_code=color_code,
        image_url=image_public_url,  # 이제 영구 Public 클라우드 URL 주소가 보관됩니다.
        memo="",
    )
    db_session.add(new_schedule)
    db_session.commit()
    db_session.refresh(new_schedule)
    return new_schedule


@app.patch("/api/schedules/{schedule_id}/move")
def move_schedule(
    schedule_id: int,
    payload: ScheduleMove,
    db_session: Session = Depends(db.get_db),
):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch.event_time = payload.event_time
    db_session.commit()
    return {"status": "success"}


@app.patch("/api/schedules/{schedule_id}")
def update_schedule_details(
    schedule_id: int,
    payload: ScheduleUpdate,
    db_session: Session = Depends(db.get_db),
):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    if payload.title is not None:
        sch.title = payload.title
    if payload.event_date is not None:
        sch.event_date = payload.event_date
    if payload.event_time is not None:
        sch.event_time = payload.event_time
    if payload.memo is not None:
        sch.memo = payload.memo

    db_session.commit()
    return {"status": "success", "message": "일정 정보 및 메모가 수정되었습니다."}


@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db_session: Session = Depends(db.get_db)):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    # 🌟 스케줄 삭제 시 Supabase 클라우드 스토리지 파일 삭제 함수 호출
    delete_storage_file(sch.image_url)
    delete_storage_file(sch.memo_file_url)

    db_session.delete(sch)
    db_session.commit()
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
    db_session: Session = Depends(db.get_db),
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

        # 🌟 2. AI 분석용 원본 이미지도 Supabase Storage에 영구 저장
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
        이 이미지에 포함된 모든 일정(시간표, 공지사항, 안내문 등)을 분석해서 빠짐없이 아래 규칙의 JSON 배열([ ... ]) 형식으로만 응답해줘.
        이미지 내에 일정이 여러 개 존재한다면, 대괄호 안에 여러 개의 객체를 넣어줘.
        앞뒤에 친절한 설명이나 마크다운 기호(```json 또는 ```)는 절대로 포함하지 말고 오직 JSON 배열 내용만 반환해줘.

        [
          {{
            "title": "추출된 일정 핵심 제목 (예: 알고리즘 과제 제출)",
            "date_str": "월-일 정보를 MM-DD 형식으로 작성 (예: 06-15)",
            "time_str": "시간 정보를 HH:MM 형식으로 작성 (예: 14:30)"
          }}
        ]

        ※ 기준 정보 및 유의사항:
        - 현재 날짜는 {current_date_friendly} 이고, 현재 시간는 {current_time_friendly} 야.
        - 만약 이미지에 '내일'이나 '요일'만 적혀있다면 이 기준 정보를 바탕으로 날짜를 정확히 계산해줘.
        - 이미지에 날짜 정보가 전혀 없다면 기본값으로 현재 날짜인 "{current_date_str}"을 채워줘.
        - 이미지에 시간 정보가 전혀 없다면 기본값으로 현재 시간인 "{current_time_str}" 또는 "12:00"으로 채워줘.
        """

        response = model.generate_content([prompt, image_parts[0]])
        raw_text = response.text.strip()

        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()

        try:
            parsed_data = json.loads(raw_text)
            if not isinstance(parsed_data, list):
                parsed_data = [parsed_data]
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
            new_schedule = db.Schedule(
                room_id=room_id,
                title=item.get("title", "새로운 일정"),
                event_date=item.get("date_str", current_date_str),
                event_time=item.get("time_str", current_time_str),
                color_code=color_code,
                image_url=image_public_url,
                memo="",
            )
            db_session.add(new_schedule)
            inserted_schedules.append(new_schedule)

        db_session.commit()

        for sch in inserted_schedules:
            db_session.refresh(sch)

        return {
            "status": "success",
            "schedules": [
                {
                    "id": sch.id,
                    "title": sch.title,
                    "event_date": sch.event_date,
                    "event_time": sch.event_time,
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
    db_session: Session = Depends(db.get_db),
):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    sch.memo = memo

    # 🌟 3. 메모장 첨부파일(.pdf, .txt, .docx 등 일반 파일)도 Supabase Storage 처리
    if file and file.filename:
        delete_storage_file(sch.memo_file_url)  # 기존 파일 클라우드에서 제거

        random_prefix = random.randint(1000, 9999)
        clean_filename = f"memo_{random_prefix}_{file.filename.replace(' ', '_')}"

        try:
            file_bytes = await file.read()
            supabase_client.storage.from_("uploaded_images").upload(
                path=clean_filename,
                file=file_bytes,
                file_options={"content-type": file.content_type}  # 타입 자동 매핑
            )
            sch.memo_file_url = supabase_client.storage.from_("uploaded_images").get_public_url(clean_filename)
        except Exception as e:
            print(f"⚠️ 메모 파일 클라우드 스토리지 저장 실패: {e}")

    db_session.commit()
    return {
        "status": "updated",
        "memo": sch.memo,
        "memo_file_url": sch.memo_file_url,
    }


@app.get("/api/schedules/{schedule_id}/sub-schedules")
def get_sub_schedules(schedule_id: int, db_session: Session = Depends(db.get_db)):
    return (
        db_session.query(db.SubSchedule)
        .filter(db.SubSchedule.schedule_id == schedule_id)
        .all()
    )


@app.post("/api/schedules/{schedule_id}/sub-schedules")
def create_sub_schedule(
    schedule_id: int,
    sub: SubScheduleCreate,
    db_session: Session = Depends(db.get_db),
):
    new_sub = db.SubSchedule(
        schedule_id=schedule_id,
        user_name=sub.user_name,
        color_code=sub.color_code,
        available_time=sub.available_time,
        note=sub.note,
    )
    db_session.add(new_sub)
    db_session.commit()
    db_session.refresh(new_sub)
    return new_sub


@app.get("/api/schedules/{schedule_id}/chats")
def get_schedule_chats(schedule_id: int, db_session: Session = Depends(db.get_db)):
    return (
        db_session.query(db.Chat).filter(db.Chat.schedule_id == schedule_id).all()
    )


@app.post("/api/schedules/{schedule_id}/chats")
def create_schedule_chat(
    schedule_id: int, chat: ChatCreate, db_session: Session = Depends(db.get_db)
):
    new_chat = db.Chat(
        schedule_id=schedule_id,
        content=chat.content,
        writer=chat.writer,
        color_code=chat.color_code,
    )
    db_session.add(new_chat)
    db_session.commit()
    return {"status": "success"}


# ==========================================
# 🌟 일정 내부 이미지/파일만 개별 삭제하는 전용 API
# ==========================================
@app.delete("/api/schedules/{schedule_id}/image")
def delete_schedule_main_image(
    schedule_id: int, db_session: Session = Depends(db.get_db)
):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    if sch.image_url:
        delete_storage_file(sch.image_url)  # 클라우드 스토리지 파일 삭제
        sch.image_url = None
        db_session.commit()
    return {"status": "success", "message": "일정 메인 이미지가 삭제되었습니다."}


@app.delete("/api/schedules/{schedule_id}/memo-file")
def delete_schedule_memo_file(
    schedule_id: int, db_session: Session = Depends(db.get_db)
):
    sch = (
        db_session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    )
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")

    if sch.memo_file_url:
        delete_storage_file(sch.memo_file_url)  # 클라우드 스토리지 파일 삭제
        sch.memo_file_url = None
        db_session.commit()
    return {"status": "success", "message": "메모 첨부파일이 삭제되었습니다."}
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session, relationship
from typing import Optional
import os
import random
import shutil
import io
import json
from datetime import datetime

# .env 및 Google AI 라이브러리 추가
from dotenv import load_dotenv
import google.generativeai as genai

import database as db

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("⚠️ 경고: .env 파일에 GEMINI_API_KEY가 설정되지 않았습니다.")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploaded_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploaded_images", StaticFiles(directory=UPLOAD_DIR), name="uploaded_images")

db.create_tables()


# ==========================================
# 🛠️ [신규 추가] 서버 로컬 하드디스크 실제 파일 삭제 함수
# ==========================================
def delete_physical_file(relative_url: Optional[str]):
    """ 데이터베이스 URL 경로를 받아 실제 서버 스토리지 내부의 파일을 삭제합니다. """
    if relative_url and relative_url.startswith("/uploaded_images/"):
        filename = relative_url.replace("/uploaded_images/", "")
        file_path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"⚠️ 파일 삭제 중 실패: {e}")


# ==========================================
# 📑 Pydantic 데이터 모델 정의 영역
# ==========================================

class RoomCreate(BaseModel):
    room_name: str

class NoticeCreate(BaseModel):
    content: str
    writer: str
    # 🌟 [수정] 공지사항 전송 데이터 모델에 기간 확장
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

@app.post("/api/rooms")
def create_room(room: RoomCreate, session: Session = Depends(db.get_db)):
    while True:
        room_code = f"{random.randint(100000, 999999)}"
        existing = session.query(db.Room).filter(db.Room.room_id == room_code).first()
        if not existing: break
        
    new_room = db.Room(room_id=room_code, room_name=room.room_name)
    session.add(new_room)
    session.commit()
    return {"room_code": room_code, "room_name": room.room_name}

@app.post("/api/rooms/{room_id}/join")
def join_room(room_id: str, payload: UserJoin, session: Session = Depends(db.get_db)):
    user = db.User(room_id=room_id, user_name=payload.user_name, color_code=payload.color_code)
    session.add(user)
    session.commit()
    return {"user_name": user.user_name, "color_code": user.color_code}
    
@app.get("/api/rooms/{room_id}/users")
def get_room_users(room_id: str, session: Session = Depends(db.get_db)):
    return session.query(db.User).filter(db.User.room_id == room_id).all()

@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str, session: Session = Depends(db.get_db)):
    room = session.query(db.Room).filter(db.Room.room_id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="방이 존재하지 않습니다.")
    
    # 1. DB에서 지워지기 전에 물리 파일들만 싹 모아서 지워줍니다.
    schedules = session.query(db.Schedule).filter(db.Schedule.room_id == room_id).all()
    for sch in schedules:
        delete_physical_file(sch.image_url)
        delete_physical_file(sch.memo_file_url)
        
    # 2. [수정됨] 자식 데이터들을 수동으로 지우는 코드 삭제됨!
    # cascade 옵션 덕분에 room만 지우면 알아서 다 날아갑니다.
    session.delete(room)
    session.commit()
    return {"status": "success", "message": "방과 업로드된 모든 이미지 파일이 완전히 삭제되었습니다."}

# 🌟 [신규 추가] 방 전체 삭제가 아닌, 특정 사용자만 방에서 나가게 하는 API
@app.delete("/api/rooms/{room_id}/users/{user_id}")
def leave_user(room_id: str, user_id: int, session: Session = Depends(db.get_db)):
    # 1. 해당 방의 해당 유저를 찾음
    user = session.query(db.User).filter(db.User.id == user_id, db.User.room_id == room_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="해당 방에 존재하지 않는 사용자입니다.")

    # 2. 채팅 유지: 사용자가 삭제되기 전에 작성한 채팅의 user_id 연결 끊기
    # (Chat 모델에 user_id가 추가되어 있다는 가정하에 작성)
    user_chats = session.query(db.Chat).filter(db.Chat.writer == user.user_name, db.Chat.room_id == room_id).all()
    for chat in user_chats:
        chat.user_id = None # 작성자 연결 끊기 (삭제 방지)
    
    # 3. 사용자만 삭제
    session.delete(user)
    session.commit()
    return {"status": "success", "message": f"{user.user_name}님이 방에서 나갔습니다."}
# ==========================================
# 📢 Notice API
# ==========================================

@app.get("/api/rooms/{room_id}/notices")
def get_notices(room_id: str, session: Session = Depends(db.get_db)):
    return session.query(db.Notice).filter(db.Notice.room_id == room_id).order_by(db.Notice.id.desc()).all()

@app.post("/api/rooms/{room_id}/notices")
def create_notice(room_id: str, notice: NoticeCreate, session: Session = Depends(db.get_db)):
    # 🌟 [수정] 프론트엔드에서 보낸 기간(start_date, end_date)을 받아서 DB에 세이브
    new_notice = db.Notice(
        room_id=room_id, 
        content=notice.content, 
        writer=notice.writer,
        start_date=notice.start_date,
        end_date=notice.end_date
    )
    session.add(new_notice)
    session.commit()
    return {"status": "success"}

@app.delete("/api/notices/{notice_id}")
def delete_notice(notice_id: int, session: Session = Depends(db.get_db)):
    notice = session.query(db.Notice).filter(db.Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="공지사항이 존재하지 않습니다.")
    session.delete(notice)
    session.commit()
    return {"status": "success", "message": "공지사항이 삭제되었습니다."}


# ==========================================
# 💬 Global Open Chat API
# ==========================================

@app.get("/api/rooms/{room_id}/chats")
def get_chats(room_id: str, session: Session = Depends(db.get_db)):
    return session.query(db.Chat).filter(db.Chat.room_id == room_id).all()

@app.post("/api/rooms/{room_id}/chats")
def create_chat(room_id: str, chat: ChatCreate, session: Session = Depends(db.get_db)):
    new_chat = db.Chat(room_id=room_id, content=chat.content, writer=chat.writer, color_code=chat.color_code)
    session.add(new_chat)
    session.commit()
    return {"status": "success"}


# ==========================================
# 📅 Schedules Main API
# ==========================================

@app.get("/api/rooms/{room_id}/schedules")
def get_room_schedules(room_id: str, session: Session = Depends(db.get_db)):
    return session.query(db.Schedule).filter(db.Schedule.room_id == room_id).all()

@app.post("/api/rooms/{room_id}/schedules/manual")
def create_schedule_manual(
    room_id: str, 
    title: str = Form(...), 
    date_str: str = Form(...), 
    time_str: str = Form(...), 
    color_code: str = Form(...), 
    file: Optional[UploadFile] = File(None), 
    session: Session = Depends(db.get_db)
):
    image_relative_url = None
    if file and file.filename:
        random_prefix = random.randint(1000, 9999)
        clean_filename = f"{random_prefix}_{file.filename.replace(' ', '_')}"
        file_location = os.path.join(UPLOAD_DIR, clean_filename)
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        image_relative_url = f"/uploaded_images/{clean_filename}"

    new_schedule = db.Schedule(
        room_id=room_id, title=title, event_date=date_str, event_time=time_str, color_code=color_code, image_url=image_relative_url, memo=""
    )
    session.add(new_schedule)
    session.commit()
    return new_schedule

@app.patch("/api/schedules/{schedule_id}/move")
def move_schedule(schedule_id: int, payload: ScheduleMove, session: Session = Depends(db.get_db)):
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    if not sch: 
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")
    
    sch.event_time = payload.event_time
    session.commit()
    return {"status": "success"}

@app.patch("/api/schedules/{schedule_id}")
def update_schedule_details(schedule_id: int, payload: ScheduleUpdate, session: Session = Depends(db.get_db)):
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
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
        
    session.commit()
    return {"status": "success", "message": "일정 정보 및 메모가 수정되었습니다."}
    
@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, session: Session = Depends(db.get_db)):
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")
    
    # 물리 이미지 파일 하드디스크에서 삭제
    delete_physical_file(sch.image_url)
    delete_physical_file(sch.memo_file_url)
    
    # [수정됨] 수동으로 서브 스케줄과 톡룸 지우던 코드 삭제됨 (Cascade 연동)
    session.delete(sch)
    session.commit()
    return {"status": "success", "message": "일정과 물리 이미지 파일이 완전히 삭제되었습니다."}

# ==========================================
# 🔍 Popup Tabs API & AI OCR API
# ==========================================

@app.post("/api/rooms/{room_id}/schedules/ai")
async def create_schedule_ai(
    room_id: str,
    color_code: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(db.get_db)
):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="서버의 .env에 API 키가 설정되지 않았습니다.")
        
    try:
        random_prefix = random.randint(1000, 9999)
        clean_filename = f"{random_prefix}_{file.filename.replace(' ', '_')}"
        file_location = os.path.join(UPLOAD_DIR, clean_filename)
        
        image_bytes = await file.read()
        with open(file_location, "wb") as buffer:
            buffer.write(image_bytes)
        image_relative_url = f"/uploaded_images/{clean_filename}"
        
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
            parsed_data = [{
                "title": "사진 업로드 자동 일정",
                "date_str": current_date_str,
                "time_str": current_time_str
            }]
            
        inserted_schedules = []
        
        for item in parsed_data:
            new_schedule = db.Schedule(
                room_id=room_id,
                title=item.get("title", "새로운 일정"),
                event_date=item.get("date_str", current_date_str),
                event_time=item.get("time_str", current_time_str),
                color_code=color_code,
                image_url=image_relative_url,
                memo=""
            )
            session.add(new_schedule)
            inserted_schedules.append(new_schedule)
            
        session.commit()
        
        for sch in inserted_schedules:
            session.refresh(sch)
        
        return {
            "status": "success",
            "schedules": [
                {
                    "id": sch.id,
                    "title": sch.title,
                    "event_date": sch.event_date,
                    "event_time": sch.event_time
                } for sch in inserted_schedules
            ]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"AI 이미지 분석 및 바로 등록 중 오류가 발생했습니다: {str(e)}"
        )

@app.patch("/api/schedules/{schedule_id}/memo")
def update_schedule_memo(
    schedule_id: int, 
    memo: str = Form(...),        
    file: Optional[UploadFile] = File(None),      
    session: Session = Depends(db.get_db)
):
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    if not sch: 
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")
    
    sch.memo = memo

    if file and file.filename:
        # 기존에 등록된 메모 파일이 있었다면 물리 저장소에서 삭제 후 덮어쓰기
        delete_physical_file(sch.memo_file_url)
        
        random_prefix = random.randint(1000, 9999)
        clean_filename = f"memo_{random_prefix}_{file.filename.replace(' ', '_')}"
        file_location = os.path.join(UPLOAD_DIR, clean_filename)
        
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        sch.memo_file_url = f"/uploaded_images/{clean_filename}"

    session.commit()
    return {
        "status": "updated", 
        "memo": sch.memo, 
        "memo_file_url": sch.memo_file_url
    }

@app.get("/api/schedules/{schedule_id}/sub-schedules")
def get_sub_schedules(schedule_id: int, session: Session = Depends(db.get_db)):
    return session.query(db.SubSchedule).filter(db.SubSchedule.schedule_id == schedule_id).all()

@app.post("/api/schedules/{schedule_id}/sub-schedules")
def create_sub_schedule(schedule_id: int, sub: SubScheduleCreate, session: Session = Depends(db.get_db)):
    new_sub = db.SubSchedule(
        schedule_id=schedule_id, user_name=sub.user_name, color_code=sub.color_code, available_time=sub.available_time, note=sub.note
    )
    session.add(new_sub)
    session.commit()
    
    # 🌟 [수정 필수] DB가 자동으로 생성해 준 고유 id를 객체에 반영하기 위해 refresh 수행
    session.refresh(new_sub) 
    
    # 🌟 [수정 필수] 생성된 서브 스케줄 객체 자체를 통째로 리턴합니다.
    return new_sub

@app.get("/api/schedules/{schedule_id}/chats")
def get_schedule_chats(schedule_id: int, session: Session = Depends(db.get_db)):
    return session.query(db.Chat).filter(db.Chat.schedule_id == schedule_id).all()

@app.post("/api/schedules/{schedule_id}/chats")
def create_schedule_chat(schedule_id: int, chat: ChatCreate, session: Session = Depends(db.get_db)):
    new_chat = db.Chat(schedule_id=schedule_id, content=chat.content, writer=chat.writer, color_code=chat.color_code)
    session.add(new_chat)
    session.commit()
    return {"status": "success"}


# ==========================================
# 🌟 [신규 추가] 일정 내부 이미지/파일만 개별 삭제하는 전용 API
# ==========================================

@app.delete("/api/schedules/{schedule_id}/image")
def delete_schedule_main_image(schedule_id: int, session: Session = Depends(db.get_db)):
    """ 일정 등록 시 업로드한 메인 이미지만 삭제합니다. """
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")
    
    if sch.image_url:
        delete_physical_file(sch.image_url) # 실제 파일 삭제
        sch.image_url = None                # DB 관계 청산
        session.commit()
    return {"status": "success", "message": "일정 메인 이미지가 삭제되었습니다."}

@app.delete("/api/schedules/{schedule_id}/memo-file")
def delete_schedule_memo_file(schedule_id: int, session: Session = Depends(db.get_db)):
    """ 일정 상세정보창(모달)의 메모 전용 첨부파일만 삭제합니다. """
    sch = session.query(db.Schedule).filter(db.Schedule.id == schedule_id).first()
    if not sch:
        raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다.")
    
    if sch.memo_file_url:
        delete_physical_file(sch.memo_file_url) # 실제 파일 삭제
        sch.memo_file_url = None                # DB 관계 청산
        session.commit()
    return {"status": "success", "message": "메모 첨부파일이 삭제되었습니다."}
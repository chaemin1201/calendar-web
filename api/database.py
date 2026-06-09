import os  # 🌟 추가: 환경 변수를 읽기 위해 필요합니다
from datetime import datetime
from dotenv import load_dotenv  # 🌟 추가: .env 파일을 읽기 위해 필요합니다
from sqlalchemy import (Column, DateTime, ForeignKey, Integer, String, Text, create_engine)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

# 1. 로컬 환경인 경우 .env 파일의 변수들을 읽어옵니다.
load_dotenv()

# 2. 환경 변수에서 DATABASE_URL을 가져옵니다.
# 기존의 DATABASE_URL = os.getenv("DATABASE_URL") 아랫부분을 이렇게 수정합니다.
DATABASE_URL = os.getenv("DATABASE_URL")

# 🌟 [수정] 문자열을 강제로 쪼개지 않고, 안전하게 드라이버 지정을 보정합니다.
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg2" + DATABASE_URL[10:]
# 🌟 [수정] Supabase는 SQLite가 아니므로 connect_args={"check_same_thread": False} 옵션을 지워야 합니다.
# Vercel 서버리스 환경에서 커넥션 찌꺼기가 남지 않도록 풀링 시스템을 끄거나 최적화합니다.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Room(Base):
    __tablename__ = "rooms"
    room_id = Column(String, primary_key=True, index=True)
    room_name = Column(String, nullable=False, default="알 수 없는 방")

    # 부모(Room) 삭제 시 연관된 모든 데이터 자동 삭제 (Cascade)
    users = relationship("User", cascade="all, delete", backref="room")
    schedules = relationship("Schedule", cascade="all, delete", backref="room")
    notices = relationship("Notice", cascade="all, delete", backref="room")
    chats = relationship("Chat", cascade="all, delete", backref="room")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id"))
    user_name = Column(String)
    color_code = Column(String)


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id"))
    title = Column(String)
    event_date = Column(String)
    event_time = Column(String)
    color_code = Column(String)
    image_url = Column(String, nullable=True)
    memo = Column(Text, nullable=True)
    memo_file_url = Column(String, nullable=True)

    # 일정 삭제 시, 해당 일정의 공석 조율과 일정 톡룸 데이터도 자동 삭제
    sub_schedules = relationship(
        "SubSchedule", cascade="all, delete", backref="schedule"
    )


class SubSchedule(Base):
    __tablename__ = "sub_schedules"
    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"))
    user_name = Column(String)
    color_code = Column(String)
    available_time = Column(String)
    note = Column(String, nullable=True)


class Notice(Base):
    __tablename__ = "notices"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id"))
    content = Column(Text)
    writer = Column(String)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    # 정렬을 위한 작성 시간 (기본값: 현재 시간)
    created_at = Column(DateTime, default=datetime.utcnow)


class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id"), nullable=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(Text)
    writer = Column(String)
    color_code = Column(String)

    # 실시간 채팅의 정확한 정렬을 위한 시간 기록
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
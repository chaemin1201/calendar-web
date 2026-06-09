import os  # 🌟 추가: 환경 변수를 읽기 위해 필요합니다
from datetime import datetime
from dotenv import load_dotenv  # 🌟 추가: .env 파일을 읽기 위해 필요합니다
from sqlalchemy import (Column, DateTime, ForeignKey, Integer, String, Text, create_engine)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

# 1. 로컬 환경인 경우 .env 파일의 변수들을 읽어옵니다.
load_dotenv()

# 2. 환경 변수에서 DATABASE_URL을 가져옵니다.
# database.py에서 DATABASE_URL 변환 부분을 이 코드로 교체합니다.

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgresql://"):
        # 주소 문자열을 건드리지 않고 앞에 드라이버 명만 깔끔하게 붙여줍니다.
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# 엔진 생성
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True  # 6543 풀러 연결을 안정적으로 유지해주는 필수 옵션
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
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RoomHeader from '../components/RoomHeader';
import CalendarBoard from '../components/CalendarBoard';
import TimeLineSide from '../components/TimeLineSide';
import ChatSidebar from '../components/ChatSidebar';
import ScheduleDetailModal from '../components/ScheduleDetailModal';

const API_BASE_URL = "";

const RAINBOW_COLORS = [
  { code: '#ff4757', name: '빨강' }, { code: '#ff9233', name: '주황' },
  { code: '#eccc68', name: '노랑' }, { code: '#2ed573', name: '초록' },
  { code: '#1e90ff', name: '파랑' }, { code: '#201399', name: '남색' },
  { code: '#991eb8', name: '보라' }, { code: '#fa88ce', name: '핑크' }
];

function CalendarRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const today = new Date();

  // 스크롤 튕김 방지용 가로 스크롤 상태 기억 변수
  const layoutRef = useRef(null);

  // 1. 전역 상태 관리
  const [schedules, setSchedules] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);
  const [notices, setNotices] = useState([]);
  const [roomChats, setRoomChats] = useState([]);
  
  const [roomName, setRoomName] = useState(`방 코드: ${roomId}`);

  // 2. 모달 및 선택된 이벤트 관련 상태
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [selectedEventData, setSelectedEventData] = useState(null);
  const [subSchedules, setSubSchedules] = useState([]);
  const [localMyTimes, setLocalMyTimes] = useState([]);
  const [eventChats, setEventChats] = useState([]);

  // 통합 삭제/나가기 확인 모달 상태
  const [confirmModal, setConfirmModal] = useState(null);

  // 3. 달력 및 날짜 조작 상태
  const [currentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );

  const [timelineClickInfo, setTimelineClickInfo] = useState(null);
  const [inputName, setInputName] = useState('');
  const [selectedColor, setSelectedColor] = useState(null);

  const [myName, setMyName] = useState(() => localStorage.getItem(`room_uname_${roomId}`) || null);
  const [myColor, setMyColor] = useState(() => localStorage.getItem(`room_color_${roomId}`) || null);

  const selectedEventId = selectedEventData?.id || selectedEventData?._id || null;

  useEffect(() => {
    setMyName(localStorage.getItem(`room_uname_${roomId}`) || null);
    setMyColor(localStorage.getItem(`room_color_${roomId}`) || null);
  }, [roomId]);

  // 데이터 가져오기 로직 분리 및 불필요한 데이터 덮어쓰기 방지
  const fetchRoomData = useCallback(async () => {
    try {
      // 스크롤 위치 사전 저장
      const currentScrollLeft = layoutRef.current ? layoutRef.current.scrollLeft : 0;

      const [resRoom, resUsers, resSch, resNotice, resChats] = await Promise.all([
        fetch(`${API_BASE_URL}/api/rooms/${roomId}`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/users`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/notices`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/chats`),
      ]);
      
      if (resRoom.ok) {
        const roomData = await resRoom.json();
        const extractedName = roomData.name || roomData.title || roomData.room_name;
        if (extractedName) {
          setRoomName(prev => prev !== extractedName ? extractedName : prev);
        }
      }
      
      if (resUsers.ok) {
        const nextUsers = await resUsers.json();
        setRoomUsers(prev => JSON.stringify(prev) !== JSON.stringify(nextUsers) ? nextUsers : prev);
      }
      if (resSch.ok) {
        const nextSch = await resSch.json();
        setSchedules(prev => JSON.stringify(prev) !== JSON.stringify(nextSch) ? nextSch : prev);
      }
      if (resNotice.ok) {
        const nextNotice = await resNotice.json();
        setNotices(prev => JSON.stringify(prev) !== JSON.stringify(nextNotice) ? nextNotice : prev);
      }
      if (resChats.ok) {
        const nextChats = await resChats.json();
        setRoomChats(prev => prev.length !== nextChats.length ? nextChats : prev);
      }

      // 렌더링 직후 사용자가 스크롤했던 가로 위치 강제 복원 (튕김 원천 차단)
      if (layoutRef.current) {
        layoutRef.current.scrollLeft = currentScrollLeft;
      }

    } catch (e) { console.error("방 데이터 로드 실패:", e); }
  }, [roomId]);

  const fetchSubSchedules = useCallback(async (schId) => {
    if (!schId || !myName) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/schedules/${schId}/sub-schedules`);
      if (res.ok) {
        const data = await res.json();
        setSubSchedules(data);
        const myTimes = data.filter(s => s.user_name === myName).map(s => s.available_time);
        setLocalMyTimes(myTimes);
      }
    } catch (e) { console.error(e); }
  }, [myName]);

  const fetchEventChats = useCallback(async (schId) => {
    if (!schId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/schedules/${schId}/chats`);
      if (res.ok) {
        const nextEvChats = await res.json();
        setEventChats(prev => prev.length !== nextEvChats.length ? nextEvChats : prev);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchSubSchedules(selectedEventId);
      fetchEventChats(selectedEventId);
    }
  }, [selectedEventId, fetchSubSchedules, fetchEventChats]);

  useEffect(() => {
    if (!selectedEventId || schedules.length === 0) return;
    const latestEvent = schedules.find(s => s.id === selectedEventId || s._id === selectedEventId);
    if (latestEvent) {
      setSelectedEventData(prev => {
        if (!prev) return prev;
        if (prev.memo_file_url !== latestEvent.memo_file_url || prev.title !== latestEvent.title) {
          return { ...prev, ...latestEvent };
        }
        return prev;
      });
    }
  }, [schedules, selectedEventId]);

  useEffect(() => {
    if (!isSplitModalOpen || !selectedEventId) return;
    const interval = setInterval(() => fetchEventChats(selectedEventId), 3000);
    return () => clearInterval(interval);
  }, [isSplitModalOpen, selectedEventId, fetchEventChats]);

  useEffect(() => {
    fetchRoomData();
    const interval = setInterval(fetchRoomData, 3000);
    return () => clearInterval(interval);
  }, [roomId, fetchRoomData]);

  const handleLeaveRoom = () => {
    setConfirmModal({ type: 'leave' });
  };

  const handleDeleteTarget = (type, id) => {
    if (!id) return;
    setConfirmModal({ type, id });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal) return;
    const { type, id } = confirmModal;

    try {
      if (type === 'leave') {
        const myUser = roomUsers.find(u => u.user_name === myName);
        const myUserId = myUser ? myUser.id : null;

        if (myUserId) {
          await fetch(`${API_BASE_URL}/api/rooms/${roomId}/users/${myUserId}`, { 
            method: 'DELETE' 
          });
        } else {
          alert("사용자 정보를 찾을 수 없습니다.");
          return;
        }

        localStorage.removeItem(`room_uname_${roomId}`);
        localStorage.removeItem(`room_color_${roomId}`);
        localStorage.removeItem(`room_name_${roomId}`);
      
        const listKey = 'my_shared_calendars'; 
        const currentList = JSON.parse(localStorage.getItem(listKey) || '[]');
        const updatedList = currentList.filter(room => String(room.id) !== String(roomId));
        document.body.style.overflow = 'unset';
        localStorage.setItem(listKey, JSON.stringify(updatedList));

        navigate('/'); 
      }
      else if (type === 'notice' || type === 'schedule') {
        let endpoint = type === 'notice' ? 'notices' : 'schedules';
        let res = await fetch(`${API_BASE_URL}/api/${endpoint}/${id}`, { method: 'DELETE' });
        
        if (!res.ok && res.status === 404) {
          res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/${endpoint}/${id}`, { method: 'DELETE' });
        }
        
        if (res.ok) {
          if (type === 'notice') setNotices(prev => prev.filter(n => n.id !== id && n._id !== id));
          if (type === 'schedule') {
            setSchedules(prev => prev.filter(s => s.id !== id && s._id !== id));
            if (selectedEventId === id) {
              setIsSplitModalOpen(false);
              setSelectedEventData(null);
            }
          }
          fetchRoomData(); 
        } else {
          alert(`삭제 실패 (에러 코드: ${res.status})`);
        }
      }
      else if (type === 'file') {
        let res = await fetch(`${API_BASE_URL}/api/schedules/${id}/memo-file`, { method: 'DELETE' });
        
        if (!res.ok && res.status === 404 && roomId) {
          res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/${id}/memo-file`, { method: 'DELETE' });
        }

        if (res.ok) {
          setSelectedEventData(prev => prev ? { ...prev, memo_file_url: null } : null);
          setSchedules(prev => prev.map(s => 
            (s.id === id || s._id === id) ? { ...s, memo_file_url: null } : s
          ));
          alert("🗑️ 첨부파일이 공유 메모장에서 제거되었습니다.");
        } else {
          alert(`파일 삭제 실패 (서버 에러 코드: ${res.status})`);
        }
      }
    } catch (err) { 
      console.error("확인 모달 처리 중 오류 발생:", err); 
      alert("서버와 통신하는 중 문제가 발생했습니다.");
    }
    setConfirmModal(null); 
  };

  const handleJoinSpace = async (e) => {
    e.preventDefault();
    if (!inputName.trim() || !selectedColor) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/join`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: inputName.trim(), color_code: selectedColor })
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem(`room_uname_${roomId}`, data.user_name);
        localStorage.setItem(`room_color_${roomId}`, data.color_code);
        setMyName(data.user_name);
        setMyColor(data.color_code);
      } else { alert("입장 실패: 정보를 확인하세요."); }
    } catch (err) { alert("입장 에러 발생"); }
  };

  const openSplitViewPrompt = (eventObj) => {
    setSelectedEventData(eventObj);
    setIsSplitModalOpen(true);
  };

  const isMatchDate = (eventDateStr, calendarDateStr) => {
    if (!eventDateStr || !calendarDateStr) return false;
    const calParts = calendarDateStr.split('-');
    return eventDateStr === `${calParts[1]}-${calParts[2]}`;
  };

  const selectedDateEvents = schedules
    .filter(s => isMatchDate(s.event_date, selectedDate))
    .sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''));

  if (!myName) {
    return (
      <div className="modal-overlay">
        <div className="modal-content-profile">
          <h2>🎨 캘린더 공간 프로필 등록</h2>
          <form onSubmit={handleJoinSpace}>
            <input 
              type="text" 
              placeholder="이름 입력" 
              value={inputName} 
              onChange={e => setInputName(e.target.value)} 
              required 
              className="profile-name-input" 
              maxLength={10} 
            />
            <div className="rainbow-palette-grid">
              {RAINBOW_COLORS.map(color => {
                const isColorTaken = roomUsers.some(user => user.color_code === color.code);
                return (
                  <button 
                    key={color.code} 
                    type="button" 
                    disabled={isColorTaken}
                    className={`rainbow-chip-btn ${selectedColor === color.code ? 'active-chip' : ''}`} 
                    style={{ 
                      backgroundColor: color.code,
                      opacity: isColorTaken ? 0.25 : 1,
                      cursor: isColorTaken ? 'not-allowed' : 'pointer',
                      border: isColorTaken ? '1px dashed #aaa' : (selectedColor === color.code ? '3px solid #333' : 'none'),
                      boxShadow: isColorTaken ? 'none' : '0 2px 5px rgba(0,0,0,0.1)'
                    }} 
                    onClick={() => setSelectedColor(color.code)}
                    title={isColorTaken ? `${color.name}은 이미 방에 있는 유저가 사용 중입니다.` : color.name}
                  />
                );
              })}
            </div>
            <button type="submit" className="profile-join-btn">🚀 입장하기</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div ref={layoutRef} className="app-container max-fluid-layout" style={{ width: '100%', overflowX: 'auto' }}>
      
      <div className="main-dashboard-content-row" style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: 'max-content', minWidth: '100%', paddingBottom: '10px' }}>
        
        {/* 1. 상단 네비게이션 바 */}
        <div className="room-top-nav-bar" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '0 5px' }}>
          <button className="nav-action-btn nav-home-btn" onClick={() => navigate('/')}>
            🏠 처음화면으로
          </button>
          
          <button className="nav-action-btn nav-leave-btn" onClick={handleLeaveRoom}>
            🚪 그룹 나가기
          </button>
        </div>

        {/* 🌟 2. 기존의 고정높이 공지사항 중복 렌더링 코드 영역을 완전히 삭제했습니다! */}

        {/* 3. 하단 실제 메인 스케줄러 및 대화방 영역 */}
        <div style={{ display: 'flex', gap: '20px', width: '100%', alignItems: 'flex-start' }}>
          
          {/* Left: 달력 및 타임라인 영역 */}
          <div className="left-workspace-zone extended-view">
            {/* 🌟 RoomHeader에 notices 주입완료 */}
            <RoomHeader 
              roomId={roomId} roomName={roomName} myName={myName} myColor={myColor}
              roomUsers={roomUsers} currentYear={currentYear} currentMonth={currentMonth}
              setCurrentMonth={setCurrentMonth} API_BASE_URL={API_BASE_URL} fetchRoomData={fetchRoomData}
              selectedDate={selectedDate} timelineClickInfo={timelineClickInfo} setTimelineClickInfo={setTimelineClickInfo}
              notices={notices} 
            />
            <div className="calendar-and-timeline-flex">
              <CalendarBoard 
                currentYear={currentYear} currentMonth={currentMonth} schedules={schedules}
                selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                isMatchDate={isMatchDate} openSplitViewPrompt={openSplitViewPrompt}
                handleDeleteTarget={handleDeleteTarget} 
              />
              <TimeLineSide 
                roomId={roomId}
                selectedDateEvents={selectedDateEvents} openSplitViewPrompt={openSplitViewPrompt}
                setSchedules={setSchedules} API_BASE_URL={API_BASE_URL} fetchRoomData={fetchRoomData}
                onCellClick={setTimelineClickInfo}
              />
            </div>
          </div>

          {/* Right: 대화창 영역 */}
          <div className="right-communication-sidebar">
            <ChatSidebar 
              roomId={roomId} myName={myName} myColor={myColor} notices={notices}
              roomChats={roomChats} API_BASE_URL={API_BASE_URL} fetchRoomData={fetchRoomData}
              handleDeleteTarget={handleDeleteTarget} 
            />
          </div>

        </div> 
      </div> 

      {/* 일정 상세 확장 모달 */}
      {isSplitModalOpen && selectedEventData && (
        <ScheduleDetailModal 
          selectedEventData={selectedEventData} selectedEventId={selectedEventId}
          myName={myName} myColor={myColor} subSchedules={subSchedules} setSubSchedules={setSubSchedules}
          localMyTimes={localMyTimes} setLocalMyTimes={setLocalMyTimes} eventChats={eventChats}
          setEventChats={setEventChats} API_BASE_URL={API_BASE_URL} fetchEventChats={fetchEventChats}
          setIsSplitModalOpen={setIsSplitModalOpen} setSelectedEventData={setSelectedEventData}
          setSchedules={setSchedules}
          handleDeleteTarget={handleDeleteTarget}
        />
      )}

      {/* 통합 커스텀 확인 모달 */}
      {confirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '16px', maxWidth: '380px', width: '90%', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>
              {confirmModal.type === 'leave' ? '🚪' : '⚠️'}
            </div>
            
            <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
              {confirmModal.type === 'leave' ? '정말로 방을 나가시겠습니까?' : '정말로 삭제하시겠습니까?'}
            </h3>
            <p style={{ color: '#777', fontSize: '14px', marginBottom: '25px', wordBreak: 'keep-all' }}>
              {confirmModal.type === 'leave' 
                ? '방을 나가시면 내 대시보드에서 제거되며 목록을 볼 수 없습니다.' 
                : '이 작업은 취소할 수 없으며 데이터가 영구적으로 삭제됩니다.'}
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal(null)} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#f1f2f6', color: '#555', cursor: 'pointer', fontWeight: 'bold' }}
              >
                취소
              </button>
              <button 
                onClick={executeConfirmAction} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#ff4757', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {confirmModal.type === 'leave' ? '방 나가기' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarRoom;
import React, { useState, useEffect, useCallback } from 'react';
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

  // 1. 전역 상태 관리
  const [schedules, setSchedules] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);
  const [notices, setNotices] = useState([]);
  const [roomChats, setRoomChats] = useState([]);
  
  // 2. 모달 및 선택된 이벤트 관련 상태
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [selectedEventData, setSelectedEventData] = useState(null);
  const [subSchedules, setSubSchedules] = useState([]);
  const [localMyTimes, setLocalMyTimes] = useState([]);
  const [eventChats, setEventChats] = useState([]);

  // 통합 삭제/나가기 확인 모달 상태
  const [confirmModal, setConfirmModal] = useState(null);

  // 3. 달력 및 날짜 조작 상태
  // eslint-disable-next-line
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );

  const [timelineClickInfo, setTimelineClickInfo] = useState(null);
  const [inputName, setInputName] = useState('');
  const [selectedColor, setSelectedColor] = useState(null);

  const [myName, setMyName] = useState(() => localStorage.getItem(`room_uname_${roomId}`) || null);
  const [myColor, setMyColor] = useState(() => localStorage.getItem(`room_color_${roomId}`) || null);
  const roomName = localStorage.getItem(`room_name_${roomId}`) || `방 코드: ${roomId}`;

  const selectedEventId = selectedEventData?.id || selectedEventData?._id || null;

  useEffect(() => {
    setMyName(localStorage.getItem(`room_uname_${roomId}`) || null);
    setMyColor(localStorage.getItem(`room_color_${roomId}`) || null);
  }, [roomId]);

  const fetchRoomData = useCallback(async () => {
    try {
      const [resUsers, resSch, resNotice, resChats] = await Promise.all([
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/users`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/notices`),
        fetch(`${API_BASE_URL}/api/rooms/${roomId}/chats`),
      ]);
      if (resUsers.ok) setRoomUsers(await resUsers.json());
      if (resSch.ok) setSchedules(await resSch.json());
      if (resNotice.ok) setNotices(await resNotice.json());
      if (resChats.ok) setRoomChats(await resChats.json());
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
      if (res.ok) setEventChats(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchSubSchedules(selectedEventId);
      fetchEventChats(selectedEventId);
    }
  }, [selectedEventId, fetchSubSchedules, fetchEventChats]);

  // 최신 schedules 데이터와 현재 열려있는 모달 데이터 실시간 동기화
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

  // 그룹 나가기 모달 호출
  const handleLeaveRoom = () => {
    setConfirmModal({ type: 'leave' });
  };

  // 삭제 비즈니스 로직 모달 호출
  const handleDeleteTarget = (type, id) => {
    if (!id) return;
    setConfirmModal({ type, id });
  };

  // 모달 내 '확인' 버튼 클릭 시 실제 동작을 수행하는 통합 함수
  const executeConfirmAction = async () => {
    if (!confirmModal) return;
    const { type, id } = confirmModal;

    try {
      if (type === 'leave') {
        // 🌟 [수정] 방 전체 삭제 대신 '나만 나가기' 로직 수행
        // 1. 현재 내 user_id 찾기
        const myUser = roomUsers.find(u => u.user_name === myName);
        const myUserId = myUser ? myUser.id : null;

        if (myUserId) {
          // 새로 만든 '나만 나가기' API 호출 (main.py에 추가한 경로)
          await fetch(`${API_BASE_URL}/api/rooms/${roomId}/users/${myUserId}`, { 
            method: 'DELETE' 
          });
        } else {
          alert("사용자 정보를 찾을 수 없습니다.");
          return;
        }

        // 2. 로컬 스토리지 정리 (내가 나갔으니 내 정보 삭제)
        localStorage.removeItem(`room_uname_${roomId}`);
        localStorage.removeItem(`room_color_${roomId}`);
        localStorage.removeItem(`room_name_${roomId}`);
      
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
        localStorage.setItem(`room_name_${roomId}`, roomName);
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
            <input type="text" placeholder="이름 입력" value={inputName} onChange={e => setInputName(e.target.value)} required className="profile-name-input" maxLength={10} />
            <div className="rainbow-palette-grid">
              {RAINBOW_COLORS.map(color => (
                <button key={color.code} type="button" className={`rainbow-chip-btn ${selectedColor === color.code ? 'active-chip' : ''}`} style={{ backgroundColor: color.code }} onClick={() => setSelectedColor(color.code)} />
              ))}
            </div>
            <button type="submit" className="profile-join-btn">🚀 입장하기</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container max-fluid-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* 상단 네비게이션 바 */}
      <div className="room-top-nav-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="nav-action-btn nav-home-btn" onClick={() => navigate('/')}>
          🏠 처음화면으로
        </button>
        
        <button className="nav-action-btn nav-leave-btn" onClick={handleLeaveRoom}>
          🚪 그룹 나가기
        </button>
      </div>

      {/* 🌟 수정된 공지사항 렌더링 영역 */}
      {(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 시간 제외, 날짜만 비교

        // 기간 내에 있는 공지만 필터링
        const activeNotices = notices.filter(n => {
          if (!n.start_date || !n.end_date) return true; // 기간 없으면 항상 노출
          const start = new Date(n.start_date);
          const end = new Date(n.end_date);
          start.setHours(0, 0, 0, 0);
          end.setHours(0, 0, 0, 0);
          return today >= start && today <= end;
        });

        return activeNotices.length > 0 ? (
          <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px 20px', borderBottom: '1px solid #ffeeba', zIndex: 100, maxHeight: '65px', overflowY: 'auto' }}>
            {activeNotices.map((n, index) => (
              <div key={n.id || n._id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', margin: '4px 0', flexWrap: 'wrap' }}>
                <span>📢 [공지] {n.content}</span>
                {n.start_date && n.end_date && (
                  <span style={{ fontSize: '11px', color: '#d9534f', backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #f5c6cb', fontWeight: 'normal' }}>
                    {n.start_date} ~ {n.end_date}
                  </span>
                )}
                <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>({n.writer || '익명'})</span>
              </div>
            ))}
          </div>
        ) : null;
      })()}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="left-workspace-zone extended-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '15px' }}>
          <RoomHeader 
            roomId={roomId} roomName={roomName} myName={myName} myColor={myColor}
            roomUsers={roomUsers} currentYear={currentYear} currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth} API_BASE_URL={API_BASE_URL} fetchRoomData={fetchRoomData}
            selectedDate={selectedDate} timelineClickInfo={timelineClickInfo} setTimelineClickInfo={setTimelineClickInfo}
          />
          <div className="calendar-and-timeline-flex" style={{ display: 'flex', gap: '20px', marginTop: '20px', alignItems: 'flex-start' }}>
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

        <ChatSidebar 
          roomId={roomId} myName={myName} myColor={myColor} notices={notices}
          roomChats={roomChats} API_BASE_URL={API_BASE_URL} fetchRoomData={fetchRoomData}
          handleDeleteTarget={handleDeleteTarget} 
        />
      </div>

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
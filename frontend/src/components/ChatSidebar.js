import React, { useState, useEffect, useRef } from 'react';

// 📅 [안전한 수정] 로컬 타임존(한국 시간 등) 기준 YYYY-MM-DD 구하기
const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getOneWeekLaterStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7); // 정확히 7일 뒤 계산
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function ChatSidebar({ roomId, myName, myColor, notices, roomChats, API_BASE_URL, fetchRoomData, handleDeleteTarget }) {
  const chatEndRef = useRef(null);
  const [noticeInput, setNoticeInput] = useState('');
  const [chatInput, setChatInput] = useState('');

  // 🌟 공지사항 노출 시작일과 종료일 상태 관리 (기본 일주일 세팅)
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getOneWeekLaterStr());

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [roomChats]);

  const handleSendGlobalChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chatInput.trim(), writer: myName, color_code: myColor })
      });
      if (res.ok) { setChatInput(''); fetchRoomData(); }
    } catch (e) { console.error(e); }
  };

  const handleAddNotice = async (e) => {
    e.preventDefault();
    if (!noticeInput.trim()) return;
    try {
      // 🌟 백엔드로 전송할 페이로드에 공지 노출 시작일/종료일 추가
      const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/notices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: noticeInput.trim(), 
          writer: myName,
          start_date: startDate,
          end_date: endDate
        })
      });
      if (res.ok) { 
        setNoticeInput(''); 
        // 등록 후 날짜 값 다시 오늘~일주일 뒤로 리셋
        setStartDate(getTodayStr());
        setEndDate(getOneWeekLaterStr());
        fetchRoomData(); 
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div 
      className="right-communication-sidebar custom-enhanced-bar" 
      style={{ 
        width: '100%',            // 🌟 고정 420px 제거, 부모가 정해준 너비에 맞춤
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        borderLeft: '1px solid #e4e7ed', 
        padding: '15px', 
        background: '#fff',
        boxSizing: 'border-box'   // 🌟 패딩으로 인해 너비가 늘어나는 것 방지
      }}
    >
      <div>
        <h5>📢 방 전체 공지사항</h5>
        <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #ffe066', maxHeight: '180px', overflowY: 'auto', marginBottom: '10px', fontSize: '12px' }}>
          {notices && notices.length > 0 ? notices.slice().reverse().map((notice, idx) => {
            const nId = notice.id || notice._id;
            return (
              <div key={nId || idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #f1f2f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: '#ff4757' }}>[공지] </span>
                  <strong>{notice.content}</strong>
                  {/* 🌟 목록에서도 설정된 공지 기간이 보이도록 연동 */}
                  {notice.start_date && notice.end_date && (
                    <div style={{ fontSize: '11px', color: '#a4b0be', marginTop: '2px' }}>
                      ⏳ {notice.start_date} ~ {notice.end_date}
                    </div>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteTarget('notice', nId); }}
                  style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontWeight: 'bold', marginLeft: '8px' }}
                >✕</button>
              </div>
            );
          }) : <span style={{ color: '#a4b0be', fontStyle: 'italic' }}>등록된 공지사항이 없습니다.</span>}
        </div>

        {/* 🌟 기간 설정을 포함할 수 있도록 정돈된 공지 등록 폼 레이아웃 */}
        <form onSubmit={handleAddNotice} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input 
              type="text" 
              placeholder="새로운 공지 등록..." 
              value={noticeInput} 
              onChange={e => setNoticeInput(e.target.value)} 
              required 
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #e4e7ed', borderRadius: '6px', fontSize: '13px' }}
            />
            <button 
              type="submit" 
              style={{ padding: '6px 12px', backgroundColor: '#ff4757', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
            >
              공지
            </button>
          </div>
          
          {/* 날짜 선택 서브 레이아웃 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#747d8c', paddingLeft: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>노출 기간:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              required 
              style={{ border: '1px solid #e4e7ed', borderRadius: '4px', padding: '2px 4px', color: '#2f3542', fontSize: '11px' }} 
            />
            <span>~</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              required 
              style={{ border: '1px solid #e4e7ed', borderRadius: '4px', padding: '2px 4px', color: '#2f3542', fontSize: '11px' }} 
            />
          </div>
        </form>
      </div>

      {/* 🌟 minHeight: 0 속성을 주어 레이아웃 스크롤 안정화 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '15px', overflow: 'hidden', minHeight: 0 }}>
        <h5>💬 실시간 전체 대화방</h5>
        <div className="messenger-chat-flow" style={{ flex: 1, overflowY: 'auto' }}>
          {roomChats && roomChats.map((chat, i) => (
            <div key={i} className={`chat-bubble-row ${chat.writer === myName ? 'is-me' : ''}`}>
              <span className="chat-user-name" style={{ color: chat.color_code }}>{chat.writer}</span>
              <div className="chat-bubble-content">{chat.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendGlobalChat} className="messenger-input-wrapper">
          <input type="text" placeholder="메시지를 입력하세요..." value={chatInput} onChange={e => setChatInput(e.target.value)} required />
          <button type="submit">전송</button>
        </form>
      </div>
    </div>
  );
}

export default ChatSidebar;
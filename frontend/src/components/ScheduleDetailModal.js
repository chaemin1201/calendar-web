import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ComboSelect from './ComboSelect';

const MONTHS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const HOURS    = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const timeSlots24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function ScheduleDetailModal({
  selectedEventData, selectedEventId, myName, myColor,
  subSchedules, setSubSchedules, localMyTimes, setLocalMyTimes,
  eventChats, API_BASE_URL, fetchEventChats,
  setIsSplitModalOpen, setSelectedEventData, setSchedules,
  handleDeleteTarget // 🌟 [추가] 부모 컴포넌트(CalendarRoom)의 공통 확인 모달 트리거 함수 받아오기
}) {
  const eventChatEndRef = useRef(null);
  const { roomId } = useParams();

  const [memoInput, setMemoInput] = useState(
    selectedEventData.note || selectedEventData.memo || selectedEventData.description || ''
  );
  const [tempTitle, setTempTitle] = useState(selectedEventData.title || '');
  
  const [tempMonth, setTempMonth] = useState(() => {
    if (!selectedEventData.event_date) return '01';
    const p = selectedEventData.event_date.split('-');
    return p.length === 3 ? p[1] : p[0];
  });
  const [tempDay, setTempDay] = useState(() => {
    if (!selectedEventData.event_date) return '01';
    const p = selectedEventData.event_date.split('-');
    return p.length === 3 ? p[2] : p[1];
  });
  
  const [tempHour, setTempHour] = useState(() => selectedEventData.event_time?.split(':')[0] || '12');
  const [tempMinute, setTempMinute] = useState(() => selectedEventData.event_time?.split(':')[1] || '00');
  const [eventChatInput, setEventChatInput] = useState('');

  const isInitialMount = useRef(true);

  // 새 채팅이 올 때마다 톡룸 하단으로 자동 스크롤
  useEffect(() => {
    eventChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [eventChats]);

  // JSON 전송 방식에서 Multipart/Form-Data(FormData) 방식으로 변경된 디바운스 자동 저장
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const delayDebounceTimer = setTimeout(async () => {
      if (!selectedEventId) return;
      
      try {
        // FormData 객체 생성 및 텍스트 데이터 주입
        const formData = new FormData();
        formData.append('memo', memoInput);
        
        // ⚠️ 주의: body가 FormData일 때는 headers에 'Content-Type': 'application/json'을 명시하면 에러가 납니다.
        let res = await fetch(`${API_BASE_URL}/api/schedules/${selectedEventId}/memo`, {
          method: 'PATCH',
          body: formData
        });

        if (!res.ok && res.status === 404 && roomId) {
          res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/${selectedEventId}/memo`, {
            method: 'PATCH',
            body: formData
          });
        }

        if (res.ok) {
          // eslint-disable-next-line
          const data = await res.json();
          // 백엔드 상태와 프론트 상태 동기화 (기존 텍스트 구조 유지)
          setSelectedEventData(prev => ({ ...prev, memo: memoInput, note: memoInput, description: memoInput }));
          setSchedules(prev => prev.map(s => (s.id === selectedEventId || s._id === selectedEventId) ? { ...s, memo: memoInput, note: memoInput, description: memoInput } : s));
        }
      } catch (e) {
        console.error(e);
      }
    }, 800);

    return () => clearTimeout(delayDebounceTimer);
  }, [memoInput, selectedEventId, API_BASE_URL, roomId, setSelectedEventData, setSchedules]);


  // 메모 전용 첨부파일 업로드 이벤트 핸들러 추가
  const handleMemoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedEventId) return;

    const formData = new FormData();
    formData.append('memo', memoInput); // 현재 입력된 메모 텍스트 동시 전송
    formData.append('file', file);      // 선택한 파일 스트림 전송

    try {
      let res = await fetch(`${API_BASE_URL}/api/schedules/${selectedEventId}/memo`, {
        method: 'PATCH',
        body: formData
      });

      if (!res.ok && res.status === 404 && roomId) {
        res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/${selectedEventId}/memo`, {
          method: 'PATCH',
          body: formData
        });
      }

      if (res.ok) {
        const data = await res.json();
        // 백엔드에서 리턴된 새 파일 주소(memo_file_url)를 상태값에 반영
        setSelectedEventData(prev => ({ ...prev, memo_file_url: data.memo_file_url }));
        setSchedules(prev => prev.map(s => (s.id === selectedEventId || s._id === selectedEventId) ? { ...s, memo_file_url: data.memo_file_url } : s));
        alert("📎 공유 메모장에 파일이 성공적으로 첨부되었습니다!");
      } else {
        alert("파일 업로드에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("파일 통신 중 오류가 발생했습니다.");
    }
  };


  const getDaysInMonth = (monthStr) => {
    const p = parseInt(monthStr, 10);
    if (isNaN(p) || p < 1 || p > 12) return Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    return Array.from({ length: new Date(new Date().getFullYear(), p, 0).getDate() }, (_, i) => String(i + 1).padStart(2, '0'));
  };

  const handleSaveChanges = async () => {
    if (!selectedEventId) return;

    const updatedFields = {
      title: tempTitle.trim(),
      event_date: `${tempMonth}-${tempDay}`,
      event_time: `${tempHour}:${tempMinute}`,
      note: memoInput,
      memo: memoInput,
      description: memoInput
    };

    if (!updatedFields.title) {
      alert("일정 제목을 입력해 주세요.");
      return;
    }

    try {
      let res = await fetch(`${API_BASE_URL}/api/schedules/${selectedEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });

      if (!res.ok && res.status === 404 && roomId) {
        res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/${selectedEventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFields)
        });
      }

      if (res.ok) {
        setSelectedEventData(prev => ({ ...prev, ...updatedFields }));
        setSchedules(prev =>
          prev.map(s => (s.id === selectedEventId || s._id === selectedEventId) ? { ...s, ...updatedFields } : s)
        );
        alert("💾 변경사항이 성공적으로 저장되었습니다!");
      } else {
        alert(`저장 실패 (서버 에러 코드: ${res.status})`);
      }
    } catch (e) { 
      console.error(e); 
      alert("서버와 통신하는 중 오류가 발생했습니다.");
    }
  };

  const handleSendEventChat = async (e) => {
    e.preventDefault();
    if (!eventChatInput.trim() || !selectedEventId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/schedules/${selectedEventId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: eventChatInput.trim(), writer: myName, color_code: myColor })
      });
      if (res.ok) { 
        setEventChatInput(''); 
        await fetchEventChats(selectedEventId); 
      }
    } catch (e) { console.error(e); }
  };

  const handleSplitTimeCellClick = async (baseHourStr) => {
    if (!selectedEventId) return;
    const targetTime = `${baseHourStr.split(':')[0]}:00`;

    if (localMyTimes.includes(targetTime)) {
      const subToDelete = subSchedules.find(s => 
        String(s.user_name).trim() === String(myName).trim() && 
        String(s.available_time) === String(targetTime)
      );
      if (!subToDelete) {
        setLocalMyTimes(prev => prev.filter(t => t !== targetTime));
        return;
      }
      const subId = subToDelete.id || subToDelete._id;
      try {
        const res = await fetch(`${API_BASE_URL}/api/sub-schedules/${subId}`, { method: 'DELETE' });
        if (res.ok) {
          setLocalMyTimes(prev => prev.filter(t => t !== targetTime));
          setSubSchedules(prev => prev.filter(s => s.id !== subId && s._id !== subId));
        }
      } catch (e) { console.error(e); }
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/api/schedules/${selectedEventId}/sub-schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_name: myName, color_code: myColor, available_time: targetTime })
        });
        if (res.ok) {
          const newSub = await res.json();
          const resultObj = newSub.data || newSub;
          setLocalMyTimes(prev => [...prev, targetTime]);
          setSubSchedules(prev => [...prev, resultObj]);
        }
      } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="custom-split-prompt-overlay">
      <div className="custom-split-container-frame" style={{ width: '95%', maxWidth: '1200px', padding: '25px', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        <button
          onClick={() => setIsSplitModalOpen(false)}
          style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', fontWeight: 'bold', color: '#aaa', zIndex: 10 }}
        >✕</button>

        <header style={{ paddingBottom: '12px', borderBottom: '1px solid #eee', marginBottom: '15px', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#2f3542' }}>📌 일정 정보 수정 및 상세 조율</h3>
        </header>

        <div style={{ display: 'flex', flex: 1, gap: '20px', overflow: 'hidden', minHeight: 0 }}>

          {/* ── [1단] 왼쪽: 공석 조율 구역 ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #eee', paddingRight: '15px', minHeight: 0 }}>
            <h5 style={{ margin: '0 0 4px 0', color: '#2f3542', fontSize: '14px' }}>⏰ 공석 조율 (클릭 시 ON/OFF)</h5>
            <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#747d8c' }}>* 1시간 단위로 가능 시간을 선택합니다.</p>
            
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e4e7ed', borderRadius: '8px', padding: '6px', background: '#f8fafc' }}>
              {timeSlots24.map(baseTime => {
                const timeKey = `${baseTime.split(':')[0]}:00`;
                const isSelected = localMyTimes.includes(timeKey);
                const others = subSchedules.filter(s => s.available_time === timeKey && s.user_name !== myName);
                
                return (
                  <div
                    key={baseTime}
                    onClick={() => handleSplitTimeCellClick(baseTime)}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '8px 12px', marginBottom: '4px',
                      borderRadius: '6px', border: `1.5px solid ${isSelected ? myColor || '#1e90ff' : '#ced6e0'}`,
                      cursor: 'pointer', background: isSelected ? `${myColor}12` : '#ffffff',
                      minHeight: '40px', transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontWeight: 'bold', fontSize: '12px', width: '55px', color: isSelected ? myColor || '#1e90ff' : '#475569' }}>
                      {timeKey}
                    </span>
                    <div style={{ flex: 1, display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {isSelected && <span style={{ background: myColor || '#1e90ff', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold' }}>나</span>}
                      {others.map((ou, idx) => (
                        <span key={idx} style={{ background: ou.color_code || '#747d8c', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold' }}>{ou.user_name}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── [2단] 가운데: 세부 데이터 변경 및 공유 메모장 ── */}
          <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRight: '1px solid #eee', paddingRight: '15px', gap: '12px', overflowY: 'auto', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h5 style={{ margin: '0', color: '#2f3542', fontSize: '14px' }}>📝 세부 변경사항</h5>
              <button 
                onClick={handleSaveChanges}
                style={{ padding: '7px 14px', background: '#1e90ff', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', boxShadow: '0 2px 4px rgba(30,144,255,0.2)' }}
              >
                💾 제목/시간 변경 저장
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#57606f' }}>일정 제목</label>
              <input
                type="text" value={tempTitle}
                onChange={e => setTempTitle(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ced6e0', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#57606f' }}>날짜 수정</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <ComboSelect value={tempMonth} onChange={setTempMonth} options={MONTHS} unit="월" />
                  <ComboSelect value={tempDay} onChange={setTempDay} options={getDaysInMonth(tempMonth)} unit="일" />
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#57606f' }}>시간 수정</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <ComboSelect value={tempHour} onChange={setTempHour} options={HOURS} unit="시" />
                  <ComboSelect value={tempMinute} onChange={setTempMinute} options={MINUTES} unit="분" />
                </div>
              </div>
            </div>

            {/* 공유 메모장 레이아웃 고도화 (파일 업로드 및 뷰어 연동) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', minHeight: '180px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#57606f' }}>📍 공유 메모장</label>
                
                {/* 메모용 파일 첨부 버튼 디자인 */}
                <label style={{ fontSize: '11px', background: '#f1f2f6', border: '1px solid #ced6e0', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', color: '#57606f', fontWeight: 'bold' }}>
                  📎 파일 첨부
                  <input type="file" onChange={handleMemoFileChange} style={{ display: 'none' }} />
                </label>
              </div>

              <textarea
                value={memoInput}
                onChange={e => setMemoInput(e.target.value)}
                placeholder="내용을 자유롭게 입력하세요. 멈추면 알아서 자동 저장됩니다..."
                style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #ced6e0', resize: 'none', fontSize: '13px', lineHeight: '1.5', outline: 'none', background: '#fdfdfd' }}
              />

              {/* 📎 메모용 첨부파일 링크 뷰어 및 🗑️ 삭제 연동 레이아웃 */}
              {selectedEventData.memo_file_url && (
                <div style={{ marginTop: '5px', background: '#f1f3f5', padding: '6px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
                    <span style={{ fontSize: '12px', color: '#2f3542', flexShrink: 0 }}>📁 첨부 파일:</span>
                    <a 
                      href={`${API_BASE_URL}${selectedEventData.memo_file_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '12px', color: '#1e90ff', fontWeight: 'bold', textDecoration: 'underline', wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {selectedEventData.memo_file_url.split('/').pop()} (열기/다운로드)
                    </a>
                  </div>

                  {/* 🌟 [수정 핵심] 부모의 통합 확인 모달 시스템을 띄우는 삭제 버튼 추가 */}
                  <button
                    type="button"
                    onClick={() => handleDeleteTarget('file', selectedEventId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff4757',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      flexShrink: 0
                    }}
                    title="첨부 파일 삭제"
                  >
                    🗑️ 삭제
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── [3단] 오른쪽: 일정 전용 독립형 실시간 톡룸 ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <h5 style={{ margin: '0 0 10px 0', color: '#2f3542', fontSize: '14px' }}>💬 일정 전용 톡룸</h5>
            
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '8px', padding: '10px', background: '#f8f9fa', marginBottom: '10px', minHeight: 0 }}>
              {eventChats.map((ec, idx) => (
                <div key={idx} style={{ marginBottom: '10px', textAlign: ec.writer === myName ? 'right' : 'left' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#747d8c', display: 'block', marginBottom: '2px' }}>{ec.writer}</span>
                  <div style={{
                    display: 'inline-block', padding: '8px 12px', borderRadius: '8px',
                    background: ec.writer === myName ? '#74c0fc' : '#ffffff',
                    color: ec.writer === myName ? '#ffffff' : '#2f3542',
                    fontSize: '13px', maxWidth: '85%', wordBreak: 'break-all', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    {ec.content}
                  </div>
                </div>
              ))}
              <div ref={eventChatEndRef} />
            </div>
            
            <form onSubmit={handleSendEventChat} style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <input
                type="text" value={eventChatInput}
                onChange={e => setEventChatInput(e.target.value)}
                placeholder="일정 톡 입력..."
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ced6e0', fontSize: '13px', outline: 'none' }} required
              />
              <button type="submit" style={{ background: '#1e90ff', color: '#fff', border: 'none', padding: '0 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>전송</button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ScheduleDetailModal;
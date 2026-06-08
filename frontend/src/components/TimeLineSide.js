import React from 'react';

const timeSlots24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function TimeLineSide({ roomId, selectedDateEvents = [], openSplitViewPrompt, setSchedules, API_BASE_URL, fetchRoomData, onCellClick }) {

  const handleDragStart = (e, eventData) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(eventData));
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'rgba(30, 144, 255, 0.08)';
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '#f8f9fa';
  };
  
  // ⏰ 빈 칸 클릭 시에도 상단/하단 위치를 판별하여 정시/30분 주입
  const handleCellClick = (e, targetHourStr) => {
    if (!onCellClick) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const precisionTime = `${targetHourStr.split(':')[0]}:${ratio >= 0.5 ? '30' : '00'}`;
    
    // 부모의 setTimelineClickInfo에 순수 시간 문자열("HH:MM")만 안전하게 전달
    onCellClick(precisionTime);
  };

  // 🛠️ 드롭 시 PATCH 주소 안전장치 정비 (/move 추가 완료)
  const handleDrop = async (e, targetHourStr) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '#f8f9fa';
    
    const eventDataStr = e.dataTransfer.getData('text/plain');
    if (!eventDataStr) return;
    
    const eventData = JSON.parse(eventDataStr);
    const targetId = eventData.id || eventData._id;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const precisionTime = `${targetHourStr.split(':')[0]}:${ratio >= 0.5 ? '30' : '00'}`;
    
    // 1. 로컬 UI 스케줄 상태 즉시 선반영 (UX 향상)
    setSchedules(prev =>
      prev.map(s => (s.id === targetId || s._id === targetId) ? { ...s, event_time: precisionTime } : s)
    );
    
    try {
      // ✅ [교정 완료] # 주석을 // 주속으로 수정하여 SyntaxError 해결
      // 🚀 백엔드 규칙에 맞게 주소 끝에 /move를 정확히 추가하여 3초 원위치 버그 소멸
      let res = await fetch(`${API_BASE_URL}/api/schedules/${targetId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_time: precisionTime })
      });
      
      // Fallback 라우트 보호막 유지
      if (!res.ok && res.status === 404 && roomId) {
        res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/${targetId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_time: precisionTime })
        });
      }
      
      if (res.ok) {
        fetchRoomData(); // 백엔드 영구 저장 완료 후 전역 동기화
      } else {
        console.error(`타임라인 드롭 수정 실패 (서버 에러 코드: ${res.status})`);
      }
    } catch (err) { 
      console.error("타임라인 네트워크 통신 오류:", err); 
    }
  };

  return (
    <section className="timeline-overview-section" style={{ flex: 0.8, padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e4e7ed' }}>
      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#2f3542', fontWeight: 'bold' }}>⏰ 타임라인</h4>
      <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#747d8c' }}>* 드롭/클릭 위치(상단=정시, 하단=30분)에 따라 자동 배정됩니다.</p>
      
      <div style={{ overflowY: 'auto', border: '1px solid #f1f2f6', borderRadius: '4px', maxHeight: '550px' }}>
        {timeSlots24.map(time => {
          const currentHour = time.split(':')[0];
          const matchedEvents = selectedDateEvents.filter(e => e.event_time && e.event_time.startsWith(`${currentHour}:`));
          
          return (
            <div
              key={time}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, time)}
              onClick={e => handleCellClick(e, time)}
              style={{ display: 'flex', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #ced6e0', minHeight: '65px', background: '#f8f9fa', transition: 'background-color 0.15s ease', cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ fontSize: '12px', color: '#2f3542', width: '55px', fontWeight: 'bold', userSelect: 'none' }}>
                {time}
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px', borderLeft: '2px solid #ffa502', paddingLeft: '10px', minHeight: '35px', alignItems: 'center', zIndex: 2 }}>
                {matchedEvents.map(e => (
                  <div
                    key={e.id || e._id}
                    onClick={evt => { 
                      evt.stopPropagation(); 
                      openSplitViewPrompt(e); 
                    }}
                    draggable
                    onDragStart={evt => handleDragStart(evt, e)}
                    style={{ background: e.color_code || '#1e90ff', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                  >
                    📌 [{e.event_time ? e.event_time.substring(0, 5) : '미정'}] {e.title}
                  </div>
                ))}
              </div>
              
              <div style={{ position: 'absolute', bottom: 0, left: '65px', right: 0, borderTop: '1px dashed #e4e7ed', height: '50%', pointerEvents: 'none', zIndex: 1 }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TimeLineSide;
import React from 'react';

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function CalendarBoard({
  currentYear,
  currentMonth,
  schedules,
  selectedDate,
  setSelectedDate,
  isMatchDate,
  openSplitViewPrompt,
  handleDeleteTarget
}) {
  // 🌟 불필요한 자체 deleteTarget 상태를 제거했습니다.

  // 달력 일수 및 시작 요일 계산
  const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth, 0).getDate();

  const blanks = Array.from({ length: firstDayIndex }, (_, i) => null);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const allCells = [...blanks, ...days];

  const rowCount = Math.ceil(allCells.length / 7);

  return (
    <div className="calendar-board-container" style={{ flex: 1.4, background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
      {/* 요일 헤더 */}
      <div className="calendar-week-days" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#747d8c' }}>
        {DAYS_OF_WEEK.map((d, i) => (
          <div key={i} style={{ color: i === 0 ? '#ff4757' : i === 6 ? '#1e90ff' : '#2f3542' }}>{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="calendar-cells-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${rowCount}, 1fr)`, gap: '4px', flex: 1, minHeight: 0 }}>
        {allCells.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} style={{ background: '#f8f9fa', borderRadius: '6px' }} />;
          }

          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = selectedDate === dateStr;
          const dayEvents = schedules.filter(s => isMatchDate(s.event_date, dateStr));

          return (
            <div
              key={`day-${day}`}
              onClick={() => setSelectedDate(dateStr)}
              style={{
                background: isSelected ? '#edf2ff' : '#fff',
                border: isSelected ? '2px solid #1e90ff' : '1px solid #f1f2f6',
                borderRadius: '6px',
                padding: '6px',
                minHeight: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                transition: 'all 0.15s ease',
                overflow: 'hidden'
              }}
            >
              <span style={{ 
                fontWeight: 'bold', 
                fontSize: '13px',
                color: idx % 7 === 0 ? '#ff4757' : idx % 7 === 6 ? '#1e90ff' : '#2f3542'
              }}>
                {day}
              </span>

              {/* 일정 칩 레이어 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flex: 1 }}>
                {dayEvents.map(e => (
                  <div
                    key={e.id || e._id}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      openSplitViewPrompt(e);
                    }}
                    style={{
                      background: e.color_code || '#1e90ff',
                      color: '#fff',
                      padding: '3px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      📌 [{e.event_time ? e.event_time.substring(0, 5) : '미정'}] {e.title}
                    </span>
                    <button
                      // ✅ ✕ 클릭 시 로컬 상태를 거치지 않고, 부모의 통합 커스텀 확인 창을 즉시 트리거합니다.
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handleDeleteTarget('schedule', e.id || e._id);
                      }}
                      style={{
                        background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                        fontSize: '10px', marginLeft: '4px', padding: '0 2px', fontWeight: 'bold', opacity: 0.8
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarBoard;
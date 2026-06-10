import React, { useState, useEffect } from 'react';
import ComboSelect from './ComboSelect';

const MONTHS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const HOURS    = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function RoomHeader({
  roomId, roomName, myName, myColor, roomUsers,
  currentYear, currentMonth, setCurrentMonth,
  API_BASE_URL, fetchRoomData,
  selectedDate, timelineClickInfo, setTimelineClickInfo,
  notices // 부모 컴포넌트(CalendarRoom)로부터 공지사항 데이터 수신
}) {
  const [title,      setTitle]       = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // 커스텀 알림(토스트 및 AI 모달)을 위한 상태 상태값
  const [toast, setToast] = useState({ show: false, message: "", isError: false });
  const [aiModal, setAiModal] = useState({ open: false, schedules: [] });

  const today = new Date();
  const [formMonth,  setFormMonth]  = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [formDay,    setFormDay]    = useState(String(today.getDate()).padStart(2, '0'));
  const [formHour,   setFormHour]   = useState('12');
  const [formMinute, setFormMinute] = useState('00');

  // 토스트 메시지 구동 함수
  const showToast = (msg, isError = false) => {
    setToast({ show: true, message: msg, isError });
    setTimeout(() => setToast({ show: false, message: "", isError: false }), 2500);
  };

  useEffect(() => {
    if (!timelineClickInfo) return;
    if (selectedDate) {
      const parts = selectedDate.split('-');
      setFormMonth(parts[1]);
      setFormDay(parts[2]);
    }
    setFormHour(timelineClickInfo.hour);
    setFormMinute(timelineClickInfo.minute);
    setTimelineClickInfo(null);
  }, [timelineClickInfo, selectedDate, setTimelineClickInfo]);

  const getDaysInMonth = (monthStr) => {
    const p = parseInt(monthStr, 10);
    if (isNaN(p) || p < 1 || p > 12) return Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    return Array.from({ length: new Date(currentYear, p, 0).getDate() }, (_, i) => String(i + 1).padStart(2, '0'));
  };

  // AI 멀티 일정 추출 연동 핸들러
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('color_code', myColor || '#1e90ff');

    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/ai`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          setAiModal({ open: true, schedules: data.schedules || [] });
          fetchRoomData(); 
        } else {
          showToast("❌ AI 일정 자동 등록에 실패했습니다.", true);
        }
      } else {
        showToast("❌ 서버 오류로 AI 기능을 사용할 수 없습니다.", true);
      }
    } catch (err) {
      console.error(err);
      showToast("❌ 서버 연결에 실패했습니다.", true);
    } finally {
      setIsUploading(false);
      if (document.getElementById('file-input')) document.getElementById('file-input').value = '';
    }
  };

  // 수동 등록 핸들러
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('date_str', `${formMonth}-${formDay}`);
    formData.append('time_str', `${formHour}:${formMinute}`);
    formData.append('color_code', myColor || '#1e90ff');
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/manual`, { method: 'POST', body: formData });
      if (res.ok) {
        setTitle('');
        fetchRoomData();
        showToast("✨ 새 일정이 성공적으로 추가되었습니다!");
      }
    } catch { 
      showToast("❌ 서버 연결에 실패했습니다.", true); 
    }
  };

  // 🌟 [수정 완료] 타임존 버그가 없는 로컬 시간(한국 시간 등) 기준 YYYY-MM-DD 구하기

  const activeNotices = (notices || []).filter(notice => {
    if (!notice.start_date || !notice.end_date) return true; // 기간 세팅이 없으면 상시 노출
    // 2. 날짜 비교를 위해 Date 객체 생성
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(notice.start_date);
  const end = new Date(notice.end_date);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  // 3. 오늘 날짜가 기간 내에 있는지 확인
  return today >= start && today <= end;
  });

  return (
    <header className="app-header" style={{ position: 'relative' }}>
      
      {/* 컴포넌트 내장 키프레임 애니메이션 */}
      <style>{`
        @keyframes toastSlideDown {
          0% { opacity: 0; transform: translate(-50%, -20px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes modalFadeIn {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* 📢 기간 내 유효한 공지사항 상단 배너 존 */}
      {activeNotices.length > 0 && (
        <div style={styles.noticeTopBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', overflow: 'hidden' }}>
            <span style={styles.noticeBadge}>📢 중요공지</span>
            <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {activeNotices.map((notice, idx) => (
                <span key={notice.id || idx} style={{ marginRight: '30px', fontSize: '13px', fontWeight: '700', color: '#2f3542' }}>
                  <strong>[{notice.writer}]</strong> {notice.content}
                  {notice.start_date && notice.end_date && (
                    <span style={{ fontSize: '11px', color: '#747d8c', marginLeft: '6px', fontWeight: 'normal' }}>
                      ({notice.start_date} ~ {notice.end_date})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="header-top-row">
        <div className="header-title-zone">
          <button onClick={() => setCurrentMonth(m => m === 1 ? 12 : m - 1)} className="month-nav-btn">◀</button>
          <h1>{currentYear}년 {currentMonth}월 스케줄러</h1>
          <button onClick={() => setCurrentMonth(m => m === 12 ? 1 : m + 1)} className="month-nav-btn">▶</button>
        </div>
        <div className="share-link-wrapper">
          <span className="share-label" style={{ fontSize: '15px', color: '#2f3542', fontWeight: 'bold' }}>{roomName} : {roomId}</span>
          <span className="my-badge-indicator" style={{ backgroundColor: myColor }}>{myName}님</span>
        </div>
      </div>

      <div className="header-bottom-row" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div className="active-room-users-card" style={{ margin: 0, padding: '12px', background: '#f1f2f6', borderRadius: '8px' }}>
          <h5>👥 참여 멤버 ({roomUsers.length}명)</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {roomUsers.map((user, idx) => (
              <div key={idx} style={{ border: `1.5px solid ${user.color_code || '#ccc'}`, padding: '3px 8px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px', background: '#fff', fontSize: '12px' }}>
                <span style={{ backgroundColor: user.color_code, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ fontWeight: 'bold' }}>{user.user_name}</span>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleManualSubmit} className="manual-form-scroll">
          <input type="text" placeholder="새로운 공용 메인 일정 등록하기"
            value={title} onChange={e => setTitle(e.target.value)}
            className="form-input-title" required />
          <div className="scroll-select-container">
            <ComboSelect value={formMonth}  onChange={setFormMonth}  options={MONTHS}                 unit="월" />
            <ComboSelect value={formDay}    onChange={setFormDay}    options={getDaysInMonth(formMonth)} unit="일" />
            <ComboSelect value={formHour}   onChange={setFormHour}   options={HOURS}                   unit="시" />
            <ComboSelect value={formMinute} onChange={setFormMinute} options={MINUTES}                 unit="분" />
          </div>
          
          <div className="file-upload-wrapper">
            <label 
              htmlFor="file-input" 
              className="custom-file-label"
              style={{
                backgroundColor: isUploading ? '#747d8c' : '#2f3542',
                color: '#fff',
                padding: '8px 15px',
                borderRadius: '6px',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                display: 'inline-block',
                fontSize: '13px',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              {isUploading ? "🔄 사진 업로드 중..." : "📷 사진 업로드"}
            </label>
            <input 
              id="file-input" 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              disabled={isUploading}
              style={{ display: 'none' }} 
            />
          </div>
          
          <button type="submit" className="form-submit-btn" style={{ backgroundColor: myColor, marginTop: '5px' }}>일정 추가</button>
        </form>
      </div>

      {/* 트렌디 토스트 알림 */}
      {toast.show && (
        <div style={{
          ...styles.toastContainer,
          borderLeft: toast.isError ? '5px solid #ff4757' : '5px solid #2ecc71'
        }}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* AI 다중 일정 자동 분석 등록 완료 모달 */}
      {aiModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize: '36px' }}>✨</span>
              <h3 style={styles.modalTitle}>AI 일정 자동 분석 완료!</h3>
              <p style={styles.modalSubtitle}>이미지 속에서 총 <strong>{aiModal.schedules.length}개</strong>의 소중한 일정을 찾아냈어요.</p>
            </div>

            <div style={styles.modalListContainer}>
              {aiModal.schedules.map((sch, i) => (
                <div key={i} style={styles.modalItem}>
                  <div style={styles.modalBadge}>📅 {sch.event_date}</div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.modalItemTitle}>{sch.title}</div>
                    <div style={styles.modalItemTime}>⏰ {sch.event_time || "시간 정보 없음"}</div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setAiModal({ open: false, schedules: [] })}
              style={{ ...styles.modalCloseBtn, backgroundColor: myColor || '#2f3542' }}
            >
              캘린더 확인하기
            </button>
          </div>
        </div>
      )}

    </header>
  );
}

// 🎨 인라인 스타일 sheets 확장
const styles = {
  noticeTopBanner: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeeba',
    borderRadius: '8px',
    padding: '10px 15px',
    marginBottom: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start', // 내용이 길어질 때 위쪽 정렬
    flexDirection: 'column', // 내용을 세로로 쌓기 위해 추가
    height: 'auto',          // 🌟 높이 자동 조절
    minHeight: '40px',       // 최소 높이 확보
    animation: 'modalFadeIn 0.3s ease-out'
  },
  noticeBadge: {
    backgroundColor: '#ff9233',
    color: '#fff',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap'
  },
  toastContainer: {
    position: 'fixed',
    top: '25px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    borderRadius: '12px',
    padding: '14px 28px',
    zIndex: 99999,
    fontSize: '14px',
    fontWeight: '700',
    color: '#2c3e50',
    animation: 'toastSlideDown 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: '30px',
    width: '90%',
    maxWidth: '440px',
    boxShadow: '0 15px 35px rgba(0,0,0,0.2)',
    textAlign: 'center',
    fontFamily: 'sans-serif',
    animation: 'modalFadeIn 0.3s ease-out'
  },
  modalHeader: { marginBottom: '20px' },
  modalTitle: { margin: '10px 0 6px 0', fontSize: '20px', fontWeight: '800', color: '#2f3542' },
  modalSubtitle: { margin: 0, fontSize: '14px', color: '#747d8c' },
  modalListContainer: { maxHeight: '220px', overflowY: 'auto', backgroundColor: '#f1f2f6', borderRadius: '12px', padding: '12px', marginBottom: '22px', textAlign: 'left' },
  modalItem: { display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', marginBottom: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' },
  modalBadge: { fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8f0fe', color: '#1e90ff', padding: '5px 8px', borderRadius: '6px', marginRight: '12px', whiteSpace: 'nowrap' },
  modalItemTitle: { fontSize: '14px', fontWeight: '700', color: '#2f3542', marginBottom: '2px' },
  modalItemTime: { fontSize: '12px', color: '#a4b0be' },
  modalCloseBtn: { width: '100%', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'opacity 0.2s' }
};

export default RoomHeader;
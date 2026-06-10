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
  notices
}) {
  const [title,      setTitle]       = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [toast, setToast] = useState({ show: false, message: "", isError: false });
  const [aiModal, setAiModal] = useState({ open: false, schedules: [] });

  const today = new Date();
  const [formMonth,  setFormMonth]  = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [formDay,    setFormDay]    = useState(String(today.getDate()).padStart(2, '0'));
  const [formHour,   setFormHour]   = useState('12');
  const [formMinute, setFormMinute] = useState('00');

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

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('color_code', myColor || '#1e90ff');

    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/schedules/ai`, { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          setAiModal({ open: true, schedules: data.schedules || [] });
          fetchRoomData(); 
        } else { showToast("❌ AI 일정 자동 등록에 실패했습니다.", true); }
      } else { showToast("❌ 서버 오류로 AI 기능을 사용할 수 없습니다.", true); }
    } catch (err) { console.error(err); showToast("❌ 서버 연결에 실패했습니다.", true); }
    finally { setIsUploading(false); if (document.getElementById('file-input')) document.getElementById('file-input').value = ''; }
  };

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
    } catch { showToast("❌ 서버 연결에 실패했습니다.", true); }
  };

  const activeNotices = (notices || []).filter(notice => {
    if (!notice.start_date || !notice.end_date) return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(notice.start_date); start.setHours(0, 0, 0, 0);
    const end = new Date(notice.end_date); end.setHours(0, 0, 0, 0);
    return today >= start && today <= end;
  });

  return (
    <header className="app-header" style={{ position: 'relative', padding: '10px 10px 0px 10px', display: 'flex', flexDirection: 'column' }}>
      
      <style>{`
        @keyframes toastSlideDown { 0% { opacity: 0; transform: translate(-50%, -20px); } 100% { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes modalFadeIn { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        
        /* 💡 가로 공지 트랙 스크롤바 커스텀 (슬림 디자인) */
        .notice-horizontal-track::-webkit-scrollbar { height: 4px; }
        .notice-horizontal-track::-webkit-scrollbar-thumb { background-color: #ff9233; border-radius: 4px; }
        .notice-horizontal-track::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* 📢 방 이름 상단 빈 여백을 정확히 타겟팅하는 가로 카드형 공지사항 존 */}
      {activeNotices.length > 0 && (
        <div style={styles.noticeHorizontalContainer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <span style={styles.noticeBadge}>📢 중요공지</span>
            <span style={{ fontSize: '11px', color: '#856404', fontWeight: 'bold' }}>({activeNotices.length})</span>
          </div>
          
          {/* 가로 스크롤 가능한 트랙 영역 */}
          <div className="notice-horizontal-track" style={styles.noticeHorizontalTrack}>
            {activeNotices.map((notice, idx) => (
              <div key={notice.id || idx} style={styles.noticeHorizontalCard}>
                <span style={styles.noticeCardContent}>
                  <strong style={{ color: '#ff9233', marginRight: '4px' }}>[{notice.writer || '방장'}]</strong>
                  {notice.content}
                </span>
                {notice.end_date && (
                  <span style={styles.noticeCardDate}>
                    ⏰ ~{notice.end_date.split('-')[1] || ''}/{notice.end_date.split('-')[2] || ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 헤더 타이틀 영역 (가로 공지가 뜰 때를 대비해 상단 여백 보정) */}
      <div className="header-top-row" style={{ marginTop: activeNotices.length > 0 ? '2px' : '0px' }}>
        <div className="header-title-zone">
          <button onClick={() => setCurrentMonth(m => m === 1 ? 12 : m - 1)} className="month-nav-btn">◀</button>
          <h1 style={{ fontSize: '22px', margin: 0 }}>{currentYear}년 {currentMonth}월 스케줄러</h1>
          <button onClick={() => setCurrentMonth(m => m === 12 ? 1 : m + 1)} className="month-nav-btn">▶</button>
        </div>
        <div className="share-link-wrapper">
          <span className="share-label" style={{ fontSize: '14px', color: '#2f3542', fontWeight: 'bold' }}>{roomName} : {roomId}</span>
          <span className="my-badge-indicator" style={{ backgroundColor: myColor, padding: '3px 10px' }}>{myName}님</span>
        </div>
      </div>

      {/* 헤더 폼 및 참여자 카드 영역 (기존의 무의미하게 컸던 간격을 15px -> 8px로 다이어트) */}
      <div className="header-bottom-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <div className="active-room-users-card" style={{ margin: 0, padding: '8px 12px', background: '#f1f2f6', borderRadius: '6px' }}>
          <h5 style={{ margin: '0 0 5px 0', fontSize: '12px' }}>👥 참여 멤버 ({roomUsers.length}명)</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {roomUsers.map((user, idx) => (
              <div key={idx} style={{ border: `1.2px solid ${user.color_code || '#ccc'}`, padding: '2px 8px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px', background: '#fff', fontSize: '11px' }}>
                <span style={{ backgroundColor: user.color_code, width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ fontWeight: 'bold' }}>{user.user_name}</span>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleManualSubmit} className="manual-form-scroll" style={{ gap: '6px' }}>
          <input type="text" placeholder="새로운 공용 메인 일정 등록하기"
            value={title} onChange={e => setTitle(e.target.value)}
            className="form-input-title" style={{ height: '34px', fontSize: '13px' }} required />
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
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                display: 'inline-block',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {isUploading ? "🔄 업로드중..." : "📷 사진 업로드"}
            </label>
            <input id="file-input" type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} style={{ display: 'none' }} />
          </div>
          
          <button type="submit" className="form-submit-btn" style={{ backgroundColor: myColor, height: '34px', fontSize: '13px', padding: '0 15px' }}>일정 추가</button>
        </form>
      </div>

      {/* 토스트 알림 */}
      {toast.show && (
        <div style={{ ...styles.toastContainer, borderLeft: toast.isError ? '5px solid #ff4757' : '5px solid #2ecc71' }}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* AI 모달 */}
      {aiModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize: '30px' }}>✨</span>
              <h3 style={styles.modalTitle}>AI 일정 자동 분석 완료!</h3>
              <p style={styles.modalSubtitle}>이미지 속에서 총 <strong>{aiModal.schedules.length}개</strong>의 소중한 일정을 찾아냈어요.</p>
            </div>
            <button onClick={() => setAiModal({ open: false, schedules: [] })} style={{ ...styles.modalCloseBtn, backgroundColor: myColor || '#2f3542' }}>캘린더 확인하기</button>
          </div>
        </div>
      )}

    </header>
  );
}

// 🎨 컴팩트 가로 구조 최적화 스타일 시트
const styles = {
  noticeHorizontalContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeeba',
    borderRadius: '6px',
    padding: '4px 10px',
    marginBottom: '6px',             // 🌟 달력 타이틀과의 마진을 대폭 압축
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    height: '40px',                 // 🌟 전체 공지함 높이를 단 40px로 봉인!
    flexShrink: 0,
    animation: 'modalFadeIn 0.25s ease-out'
  },
  noticeBadge: {
    backgroundColor: '#ff9233',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap'
  },
  noticeHorizontalTrack: {
    display: 'flex',
    gap: '8px',
    width: '100%',
    overflowX: 'auto',
    alignItems: 'center',
    boxSizing: 'border-box'
  },
  noticeHorizontalCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid #ffeeba',
    borderLeft: '3.5px solid #ff9233',
    borderRadius: '4px',
    padding: '4px 10px',
    minWidth: '240px',              // 글자가 가려지지 않는 최소 가로 폭
    maxWidth: '360px',
    height: '26px',
    boxSizing: 'border-box',
    flexShrink: 0
  },
  noticeCardContent: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#2f3542',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',       // 고정 폭보다 너무 긴 문장은 매끄럽게 ... 처리
    flex: 1
  },
  noticeCardDate: {
    fontSize: '10px',
    color: '#747d8c',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  toastContainer: { position: 'fixed', top: '25px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', borderRadius: '12px', padding: '14px 28px', zIndex: 99999, fontSize: '14px', fontWeight: '700', color: '#2c3e50', animation: 'toastSlideDown 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: '20px', padding: '30px', width: '90%', maxWidth: '440px', boxShadow: '0 15px 35px rgba(0,0,0,0.2)', textAlign: 'center', animation: 'modalFadeIn 0.3s ease-out' },
  modalHeader: { marginBottom: '20px' },
  modalTitle: { margin: '10px 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#2f3542' },
  modalSubtitle: { margin: 0, fontSize: '13px', color: '#747d8c' },
  modalCloseBtn: { width: '100%', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }
};

export default RoomHeader;
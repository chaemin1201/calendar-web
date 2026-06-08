import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = "";

function MainHome() {
  const navigate = useNavigate();
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState(''); // ✅ 방 이름 입력 상태
  const [myRooms, setMyRooms] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('my_shared_calendars');
    if (saved) setMyRooms(JSON.parse(saved));
  }, []);

  // ✅ 원본 로직 100% 유지 (에러 추적 콘솔 추가)
  const createNewSpace = async () => {
    const trimmedName = roomNameInput.trim();
    if (!trimmedName) { alert("방 이름을 입력해 주세요."); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_name: trimmedName })
      });
      if (response.ok) {
        const data = await response.json();
        const targetId = data.room_code || data.room_id;
        const finalName = data.room_name || trimmedName;
        localStorage.setItem(`room_name_${targetId}`, finalName);
        saveRoomToHistory(targetId, finalName);
        navigate(`/calendar/${targetId}`);
      } else {
        // 422, 500 등 서버가 응답은 했으나 거절한 경우 원인 출력
        const errText = await response.text();
        console.error("서버 응답 거절 사유:", errText);
        alert(`서버 응답 실패 (오류 코드: ${response.status})`);
      }
    } catch (err) { 
      // 💡 네트워크 단절, 주소 불일치 등 아예 연결이 안 된 경우 콘솔에 진짜 원인 출력
      console.error("❌ 실제 발생한 네트워크 에러 상세 내용:", err);
      alert("서버 연결 실패"); 
    }
  };

  const handleJoinByCode = (e) => {
    e.preventDefault();
    const trimmed = roomCodeInput.trim();
    if (trimmed.length !== 6) { alert("방 번호는 숫자 6자리를 입력해 주세요."); return; }
    const existingName = localStorage.getItem(`room_name_${trimmed}`);
    saveRoomToHistory(trimmed, existingName || `방 코드: ${trimmed}`);
    navigate(`/calendar/${trimmed}`);
  };

  // ✅ 방 이름 함께 저장 (원본 유지)
  const saveRoomToHistory = (id, name) => {
    const saved = localStorage.getItem('my_shared_calendars');
    let arr = saved ? JSON.parse(saved) : [];
    const existIdx = arr.findIndex(r => r.id === id);
    if (existIdx === -1) {
      arr.push({ id, name: name || `방 코드: ${id}`, joinedAt: new Date().toLocaleDateString() });
    } else {
      arr[existIdx].name = name || arr[existIdx].name;
    }
    localStorage.setItem('my_shared_calendars', JSON.stringify(arr));
    setMyRooms([...arr]);
  };

  const handleRemoveRoomHistory = (e, id) => {
    e.stopPropagation();
    if (!window.confirm('방을 대시보드에서 제거하시겠습니까?')) return;
    const updated = myRooms.filter(r => r.id !== id);
    setMyRooms(updated);
    localStorage.setItem('my_shared_calendars', JSON.stringify(updated));
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>🗓️ 스마트 캘린더</h1>
        <p>방별로 분리된 일정 조율 및 실시간 전체 채팅 플랫폼</p>

        {/* ✅ 원래 쓰시던 인풋창과 개설 버튼 디자인 컴포넌트 구조 100% 고정 */}
        <input
          type="text"
          placeholder="새 방 이름 입력 (예: 졸업여행 계획)"
          value={roomNameInput}
          onChange={e => setRoomNameInput(e.target.value)}
          className="code-input-field"
          style={{ marginBottom: '10px', width: '100%' }}
          maxLength={20}
        />
        <button onClick={createNewSpace} className="create-room-btn">새로운 공간 개설하기</button>

        <div className="home-divider"><span>또는 코드 입력</span></div>
        <form onSubmit={handleJoinByCode} className="code-entry-form">
          <input
            type="text" placeholder="방 번호 6자리 입력" value={roomCodeInput}
            onChange={e => setRoomCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
            maxLength={6} className="code-input-field"
          />
          <button type="submit" className="code-join-btn">입장하기</button>
        </form>

        {myRooms.length > 0 && (
          <div className="my-rooms-dashboard">
            <div className="home-divider" style={{ marginTop: '30px' }}>
              <span>내가 참여 중인 공간 ({myRooms.length})</span>
            </div>
            <ul className="my-rooms-list">
              {myRooms.map(room => (
                <li key={room.id} className="my-room-item" onClick={() => navigate(`/calendar/${room.id}`)}>
                  <div className="room-info-text">
                    <span>📂</span> <strong>{room.name || room.id}</strong>
                    <span style={{ fontSize: '11px', color: '#a4b0be', marginLeft: '8px' }}>({room.id})</span>
                  </div>
                  <button type="button" className="room-delete-list-btn" onClick={e => handleRemoveRoomHistory(e, room.id)}>✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default MainHome;
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
        const errText = await response.text();
        console.error("서버 응답 거절 사유:", errText);
        alert(`서버 응답 실패 (오류 코드: ${response.status})`);
      }
    } catch (err) { 
      console.error("❌ 실제 발생한 네트워크 에러 상세 내용:", err);
      alert("서버 연결 실패"); 
    }
  };

  // 🌟 [수정] 코드 입력 후 입장할 때, 백엔드로부터 진짜 방 이름을 API로 받아와 히스토리에 저장합니다.
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const trimmed = roomCodeInput.trim();
    if (trimmed.length !== 6) { alert("방 번호는 숫자 6자리를 입력해 주세요."); return; }

    try {
      // 1. 서버에 해당 방의 정보를 요청해서 방 이름을 가져옵니다.
      const response = await fetch(`${API_BASE_URL}/api/rooms/${trimmed}`);
      
      let finalName = `방 코드: ${trimmed}`;
      
      if (response.ok) {
        const data = await response.json();
        // 백엔드 명세에 맞춰 data.room_name 또는 data.name 등을 유연하게 매핑합니다.
        finalName = data.room_name || data.name || finalName;
      }

      // 2. 알아낸 진짜 방 이름을 로컬 저장소에 완벽히 동기화합니다.
      localStorage.setItem(`room_name_${trimmed}`, finalName);
      saveRoomToHistory(trimmed, finalName);
      navigate(`/calendar/${trimmed}`);

    } catch (err) {
      console.error("방 정보 조회 실패:", err);
      // 서버 통신이 실패하더라도 기존 로직대로 입장은 시켜주는 가드 코드 처리
      const existingName = localStorage.getItem(`room_name_${trimmed}`);
      saveRoomToHistory(trimmed, existingName || `방 코드: ${trimmed}`);
      navigate(`/calendar/${trimmed}`);
    }
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

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>🗓️ 스마트 캘린더</h1>
        <p>방별로 분리된 일정 조율 및 실시간 전체 채팅 플랫폼</p>

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
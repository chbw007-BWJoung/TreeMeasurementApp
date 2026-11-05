import React, { useState } from 'react';
import { supabase } from './supabaseClient';

// 빈 칸은 0이 아니라 null(미측정)로 저장합니다. 0으로 저장하면 "지하고 0m"와 구분할 수 없습니다.
const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const inputStyle = { width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' };

export default function App() {
  const [height, setHeight] = useState('');
  const [clearLength, setClearLength] = useState('');
  const [dbh, setDbh] = useState('');
  const [crownWidth, setCrownWidth] = useState('');
  const [azimuth, setAzimuth] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const showError = (text) => {
    setIsError(true);
    setMessage(text);
  };

  // Supabase에 데이터 저장하는 함수
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');

    const record = {
      height: toNumberOrNull(height),
      clear_length: toNumberOrNull(clearLength),
      dbh: toNumberOrNull(dbh), // 흉고직경 (cm)
      crown_width: toNumberOrNull(crownWidth),
      azimuth: azimuth === '' ? null : Math.round(Number(azimuth)) % 360,
    };

    // 기본 검증
    if (record.height === null || record.height <= 0) return showError('수고를 0보다 큰 값으로 입력하세요.');
    if (record.clear_length !== null && record.clear_length > record.height)
      return showError('지하고는 수고보다 클 수 없습니다.');
    if (record.azimuth !== null && (Number.isNaN(record.azimuth) || record.azimuth < 0))
      return showError('방위각은 0~359° 사이로 입력하세요.');

    setLoading(true);
    try {
      const { error } = await supabase.from('tree_measurements').insert([record]);
      if (error) throw error;

      setIsError(false);
      setMessage('성공적으로 Supabase DB에 저장되었습니다!');
      setHeight('');
      setClearLength('');
      setDbh('');
      setCrownWidth('');
      setAzimuth('');
    } catch (err) {
      // 네트워크 오류 등 예외도 화면에 표시 (이전 코드는 예외 시 '저장 중...'에 멈춤)
      showError('저장 실패: ' + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>🌲 수목 측정 기록 앱</h2>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>수고 (m):</label>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={height} onChange={(e) => setHeight(e.target.value)} style={inputStyle} placeholder="예: 12.5" required />
        </div>
        <div>
          <label>지하고 (m):</label>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={clearLength} onChange={(e) => setClearLength(e.target.value)} style={inputStyle} placeholder="예: 3.2" />
        </div>
        <div>
          <label>흉고직경 / DBH (cm):</label>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={dbh} onChange={(e) => setDbh(e.target.value)} style={inputStyle} placeholder="예: 24.5 (지상 1.2m 줄기 지름)" />
        </div>
        <div>
          <label>수관폭 (m):</label>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={crownWidth} onChange={(e) => setCrownWidth(e.target.value)} style={inputStyle} placeholder="예: 5.1" />
        </div>
        <div>
          <label>방위각 (°):</label>
          <input type="number" inputMode="numeric" step="1" min="0" max="359" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={inputStyle} placeholder="예: 120" />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? '저장 중...' : 'DB에 저장하기'}
        </button>
      </form>
      {message && <p style={{ marginTop: '15px', color: isError ? '#f87171' : '#4ade80' }}>{message}</p>}
    </div>
  );
}

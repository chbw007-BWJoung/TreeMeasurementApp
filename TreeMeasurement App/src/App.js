import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [height, setHeight] = useState('');
  const [clearLength, setClearLength] = useState('');
  const [crownWidth, setCrownWidth] = useState('');
  const [azimuth, setAzimuth] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Supabase에 데이터 저장하는 함수
  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.from('tree_measurements').insert([
      {
        height: parseFloat(height) || 0,
        clear_length: parseFloat(clearLength) || 0,
        crown_width: parseFloat(crownWidth) || 0,
        azimuth: parseInt(azimuth) || 0,
      },
    ]);

    setLoading(false);
    if (error) {
      setMessage('저장 실패: ' + error.message);
    } else {
      setMessage('성공적으로 Supabase DB에 저장되었습니다!');
      setHeight('');
      setClearLength('');
      setCrownWidth('');
      setAzimuth('');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>🌲 수목 측정 기록 앱</h2>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>수고 (m):</label>
          <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px' }} placeholder="예: 12.5" required />
        </div>
        <div>
          <label>지하고 (m):</label>
          <input type="number" step="0.1" value={clearLength} onChange={(e) => setClearLength(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px' }} placeholder="예: 3.2" />
        </div>
        <div>
          <label>수관폭 (m):</label>
          <input type="number" step="0.1" value={crownWidth} onChange={(e) => setCrownWidth(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px' }} placeholder="예: 5.1" />
        </div>
        <div>
          <label>방위각 (°):</label>
          <input type="number" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '5px' }} placeholder="예: 120" />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
          {loading ? '저장 중...' : 'DB에 저장하기'}
        </button>
      </form>
      {message && <p style={{ marginTop: '15px', color: message.includes('성공') ? '#4ade80' : '#f87171' }}>{message}</p>}
    </div>
  );
}
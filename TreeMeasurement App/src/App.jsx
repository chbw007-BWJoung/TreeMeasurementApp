import React, { useEffect, useState } from 'react';
import { supabase, configError } from './supabaseClient';
import Clinometer from './Clinometer.jsx';

// 빈 칸은 0이 아니라 null(미측정)로 저장합니다. 0으로 저장하면 "지하고 0m"와 구분할 수 없습니다.
const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// 측정값은 소수점 첫째 자리(X.X)로 반올림해 저장합니다. (부동소수 오차 보정: 1.05 → 1.1)
const round1 = (n) => (n === null ? null : Math.round((n + Math.sign(n) * Number.EPSILON) * 10) / 10);

const inputStyle = { width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' };

// 수종 입력 시 자동완성 목록 (최근 입력한 수종이 앞에 나옵니다)
const COMMON_SPECIES = [
  '소나무', '곰솔', '느티나무', '은행나무', '왕벚나무', '벚나무', '이팝나무', '회화나무', '팽나무',
  '버즘나무', '메타세쿼이아', '단풍나무', '중국단풍', '느릅나무', '향나무', '측백나무', '잣나무',
  '전나무', '주목', '백합나무', '튤립나무', '산딸나무', '모감주나무', '배롱나무', '감나무',
  '느릅나무', '물푸레나무', '상수리나무', '신갈나무', '굴참나무', '오동나무', '가죽나무', '아까시나무',
];
const RECENT_KEY = 'tm-species-recent';
const loadRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
const saveRecent = (sp) => {
  try {
    const list = [sp, ...loadRecent().filter((s) => s !== sp)].slice(0, 15);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* 저장 안 돼도 무관 */ }
};

// 오늘 0시(현지 시간) ~ 내일 0시
const todayRange = () => {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return [s.toISOString(), e.toISOString()];
};

const COLUMN_HINT =
  ' → Supabase SQL Editor에서 supabase_schema.sql을 실행해 tree_no·species 칸을 추가하세요.';

export default function App() {
  const [treeNo, setTreeNo] = useState('');
  const [species, setSpecies] = useState('');
  const [recent, setRecent] = useState(loadRecent);
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

  // 오늘 저장된 가장 큰 일련번호 + 1 을 다음 번호로 제안
  const suggestNextNo = async () => {
    if (!supabase) return;
    const [s, e] = todayRange();
    const { data, error } = await supabase
      .from('tree_measurements')
      .select('tree_no')
      .gte('created_at', s).lt('created_at', e)
      .not('tree_no', 'is', null)
      .order('tree_no', { ascending: false })
      .limit(1);
    if (error) {
      if (/tree_no/.test(error.message)) showError('DB에 일련번호(tree_no) 칸이 없습니다.' + COLUMN_HINT);
      return;
    }
    setTreeNo(String((data?.[0]?.tree_no ?? 0) + 1));
  };

  useEffect(() => { suggestNextNo(); }, []);

  // 센서 측정 결과를 입력란에 채움 (빈 값은 기존 입력 유지)
  const applyMeasurement = (m) => {
    setHeight(m.height);
    if (m.clearLength !== '') setClearLength(m.clearLength);
    if (m.crownWidth !== '') setCrownWidth(m.crownWidth);
    if (m.azimuth !== '') setAzimuth(m.azimuth);
    setMessage('');
  };

  // Supabase에 데이터 저장하는 함수
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');

    const no = parseInt(treeNo, 10);
    const record = {
      tree_no: no,
      species: species.trim() || null,
      height: round1(toNumberOrNull(height)),
      clear_length: round1(toNumberOrNull(clearLength)),
      dbh: round1(toNumberOrNull(dbh)), // 흉고직경 (cm)
      crown_width: round1(toNumberOrNull(crownWidth)),
      azimuth: azimuth === '' ? null : Math.round(Number(azimuth)) % 360,
    };

    // 기본 검증
    if (!Number.isInteger(no) || no < 1 || no > 500) return showError('일련번호(No.)를 1~500 사이로 입력하세요.');
    if (!record.species) return showError('수종을 입력하세요.');
    if (record.height === null || record.height <= 0) return showError('수고를 0보다 큰 값으로 입력하세요.');
    if (record.clear_length !== null && record.clear_length > record.height)
      return showError('지하고는 수고보다 클 수 없습니다.');
    if (record.azimuth !== null && (Number.isNaN(record.azimuth) || record.azimuth < 0))
      return showError('방위각은 0~359° 사이로 입력하세요.');

    if (!supabase) return showError(configError || 'Supabase 설정이 없습니다.');

    setLoading(true);
    try {
      // 같은 날 같은 번호가 이미 있으면 확인
      const [s, en] = todayRange();
      const dup = await supabase.from('tree_measurements').select('id')
        .eq('tree_no', no).gte('created_at', s).lt('created_at', en).limit(1);
      if (dup.error) throw dup.error;
      if (dup.data?.length && !window.confirm(`오늘 이미 No.${no} 기록이 있습니다. 그래도 저장할까요?\n(조사표에는 나중 기록이 우선 적용됩니다)`)) {
        return;
      }

      const { error } = await supabase.from('tree_measurements').insert([record]);
      if (error) throw error;

      saveRecent(record.species);
      setRecent(loadRecent());
      setIsError(false);
      setMessage(`No.${no} ${record.species} — 저장되었습니다! 다음 번호: ${no + 1}`);
      setTreeNo(String(no + 1));  // 다음 나무 번호
      // 수종은 같은 수종이 이어지는 경우가 많아 그대로 둡니다.
      setHeight('');
      setClearLength('');
      setDbh('');
      setCrownWidth('');
      setAzimuth('');
    } catch (err) {
      const m = err?.message ?? String(err);
      showError('저장 실패: ' + m + (/tree_no|species|column/i.test(m) ? COLUMN_HINT : ''));
    } finally {
      setLoading(false);
    }
  };

  const speciesOptions = [...new Set([...recent, ...COMMON_SPECIES])];

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>🌲 수목 측정 기록 앱</h2>
      {configError && (
        <div style={{ background: '#7f1d1d', color: '#fff', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '14px', wordBreak: 'break-all' }}>
          ⚠️ {configError}
        </div>
      )}

      {/* 수목 식별: 일련번호 = 기초현황조사표 No. */}
      <section style={{ display: 'flex', gap: '10px', background: '#1c1c1e', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
        <div style={{ flex: '0 0 90px' }}>
          <label style={{ display: 'block' }}>No.</label>
          <input type="number" inputMode="numeric" min="1" max="500" step="1" value={treeNo}
            onChange={(e) => setTreeNo(e.target.value)} style={{ ...inputStyle, height: '42px', fontWeight: 'bold' }} placeholder="1" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block' }}>수종</label>
          <input type="text" list="species-list" value={species} onChange={(e) => setSpecies(e.target.value)}
            style={{ ...inputStyle, height: '42px' }} placeholder="예: 소나무" autoComplete="off" />
          <datalist id="species-list">
            {speciesOptions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </section>

      <Clinometer onApply={applyMeasurement} />
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label>수고 (m):</label>
          <input type="number" inputMode="decimal" step="any" min="0" value={height} onChange={(e) => setHeight(e.target.value)} style={inputStyle} placeholder="예: 12.5" required />
        </div>
        <div>
          <label>지하고 (m):</label>
          <input type="number" inputMode="decimal" step="any" min="0" value={clearLength} onChange={(e) => setClearLength(e.target.value)} style={inputStyle} placeholder="예: 3.2" />
        </div>
        <div>
          <label>흉고직경 / DBH (cm):</label>
          <input type="number" inputMode="decimal" step="any" min="0" value={dbh} onChange={(e) => setDbh(e.target.value)} style={inputStyle} placeholder="예: 24.5 (지상 1.2m 줄기 지름)" />
        </div>
        <div>
          <label>수관폭 (m):</label>
          <input type="number" inputMode="decimal" step="any" min="0" value={crownWidth} onChange={(e) => setCrownWidth(e.target.value)} style={inputStyle} placeholder="예: 5.1" />
        </div>
        <div>
          <label>방위각 (°):</label>
          <input type="number" inputMode="numeric" step="1" min="0" max="359" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={inputStyle} placeholder="예: 120" />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? '저장 중...' : `No.${treeNo || '?'} DB에 저장하기`}
        </button>
      </form>
      {message && <p style={{ marginTop: '15px', color: isError ? '#f87171' : '#4ade80' }}>{message}</p>}
    </div>
  );
}

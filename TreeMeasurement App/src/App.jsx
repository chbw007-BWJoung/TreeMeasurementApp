import React, { useEffect, useState } from 'react';
import { supabase, configError } from './supabaseClient';
import Clinometer from './Clinometer.jsx';
import { downloadSurveyXlsx } from './surveyExport.js';

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

// 수목진단 앱의 기초현황조사표 페이지 (?import=1 이면 가져오기 창이 바로 열림)
const SURVEY_URL = 'https://cheery-youtiao-dca659.netlify.app/survey/index.html?import=1';

const COLUMN_HINT =
  ' → Supabase SQL Editor에서 supabase_schema.sql을 실행해 tree_no·species·archived 칸을 추가하세요.';

// 진행 중인 조사 = 보관(archived)되지 않은 기록.  '초기화'하면 보관 처리되고 No.가 1번부터 다시 시작됩니다.
const active = (q) => q.eq('archived', false);

export default function App() {
  const [treeNo, setTreeNo] = useState('');
  const [species, setSpecies] = useState('');
  const [recent, setRecent] = useState(loadRecent);
  const [height, setHeight] = useState('');
  const [clearLength, setClearLength] = useState('');
  const [dbh, setDbh] = useState('');
  const [girth, setGirth] = useState(''); // 흉고둘레 (cm)
  const [crownWidth, setCrownWidth] = useState('');
  const [azimuth, setAzimuth] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [activeCount, setActiveCount] = useState(null);
  const [busy, setBusy] = useState(false);

  const showError = (text) => {
    setIsError(true);
    setMessage(text);
  };

  // 진행 중인 조사의 가장 큰 일련번호 + 1 을 다음 번호로 제안 (초기화 후에는 1번)
  const suggestNextNo = async () => {
    if (!supabase) return;
    const { data, error } = await active(supabase
      .from('tree_measurements')
      .select('tree_no')
      .not('tree_no', 'is', null))
      .order('tree_no', { ascending: false })
      .limit(1);
    if (error) {
      if (/tree_no|archived|column/i.test(error.message)) showError('DB에 필요한 칸이 없습니다: ' + error.message + COLUMN_HINT);
      return;
    }
    setTreeNo(String((data?.[0]?.tree_no ?? 0) + 1));
  };

  const refreshCount = async () => {
    if (!supabase) return;
    const { count, error } = await active(supabase.from('tree_measurements').select('id', { count: 'exact', head: true }));
    if (!error) setActiveCount(count ?? 0);
  };

  useEffect(() => { suggestNextNo(); refreshCount(); }, []);

  const loadActive = async () => {
    const { data, error } = await active(supabase.from('tree_measurements').select('*'))
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  };

  // 기초조사표 엑셀 다운로드 (reset=true 이면 다운로드 후 보관 처리 → 1번부터)
  const exportSurvey = async (reset) => {
    if (!supabase) return showError(configError || 'Supabase 설정이 없습니다.');
    setMessage('');
    setBusy(true);
    try {
      const recs = await loadActive();
      if (!recs.length) return showError('내려받을 측정 기록이 없습니다.');
      if (reset && !window.confirm(
        `측정 기록 ${recs.length}건을 기초현황조사표로 내려받고 초기화합니다.\n\n` +
        '· 기록은 삭제되지 않고 DB에 보관됩니다.\n· 다음 측정은 No.1부터 시작합니다.\n\n계속할까요?')) return;

      const fname = await downloadSurveyXlsx(recs);

      if (reset) {
        const ids = recs.map((x) => x.id);
        const { data, error } = await supabase.from('tree_measurements')
          .update({ archived: true }).in('id', ids).select('id');
        if (error) throw error;
        if ((data?.length ?? 0) < ids.length) {
          throw new Error('보관 처리 권한이 없습니다(0건 변경). supabase_schema.sql의 "보관(초기화) 권한" 부분을 실행하세요.');
        }
        setTreeNo('1');
        setActiveCount(0);
        setIsError(false);
        setMessage(`📥 ${fname} 다운로드 완료 · ${ids.length}건 보관 처리 · 다음 측정은 No.1부터 시작합니다.`);
      } else {
        setIsError(false);
        setMessage(`📥 ${fname} 다운로드 완료 (${recs.length}건)`);
      }
    } catch (err) {
      const m = err?.message ?? String(err);
      showError('실패: ' + m + (/archived|column/i.test(m) ? COLUMN_HINT : ''));
    } finally {
      setBusy(false);
    }
  };

  // 센서 측정 결과를 입력란에 채움 (빈 값은 기존 입력 유지)
  const applyMeasurement = (m) => {
    if (m.height) setHeight(m.height);
    if (m.clearLength) setClearLength(m.clearLength);
    if (m.crownWidth) setCrownWidth(m.crownWidth);
    if (m.azimuth) setAzimuth(m.azimuth);
    if (m.dbh) setDbh(m.dbh);
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
      // 진행 중인 조사에 같은 번호가 이미 있으면 확인
      const dup = await active(supabase.from('tree_measurements').select('id')
        .eq('tree_no', no)).limit(1);
      if (dup.error) throw dup.error;
      if (dup.data?.length && !window.confirm(`이미 No.${no} 기록이 있습니다. 그래도 저장할까요?\n(조사표에는 나중 기록이 우선 적용됩니다)`)) {
        return;
      }

      const { error } = await supabase.from('tree_measurements').insert([record]);
      if (error) throw error;

      saveRecent(record.species);
      setRecent(loadRecent());
      setIsError(false);
      setMessage(`No.${no} ${record.species} — 저장되었습니다! 다음 번호: ${no + 1}`);
      setTreeNo(String(no + 1));  // 다음 나무 번호
      refreshCount();
      // 수종은 같은 수종이 이어지는 경우가 많아 그대로 둡니다.
      setHeight('');
      setClearLength('');
      setDbh('');
      setGirth('');
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
          <input type="number" inputMode="decimal" step="any" min="0" value={dbh} onChange={(e) => { setDbh(e.target.value); setGirth(''); }} style={inputStyle} placeholder="예: 24.5 (지상 1.2m 줄기 지름)" />
          {/* 줄자로 잰 흉고둘레 → 지름 자동 환산 (지름 = 둘레 ÷ π) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '14px', color: '#d1d5db' }}>
            <span style={{ whiteSpace: 'nowrap' }}>또는 흉고둘레</span>
            <input type="number" inputMode="decimal" step="any" min="0" value={girth}
              onChange={(e) => {
                setGirth(e.target.value);
                const c = toNumberOrNull(e.target.value);
                setDbh(c && c > 0 ? (round1(c / Math.PI)).toFixed(1) : '');
              }}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }} placeholder="둘레 cm → 지름 자동 계산" />
          </div>
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
      {/* 조사 마무리: 기초조사표 다운로드 / 초기화 */}
      <section style={{ marginTop: '24px', background: '#1c1c1e', borderRadius: '10px', padding: '14px' }}>
        <h3 style={{ margin: '0 0 6px' }}>📦 조사 마무리</h3>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#d1d5db' }}>
          진행 중인 측정 기록: <b>{activeCount ?? '–'}건</b>
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" disabled={busy} onClick={() => exportSurvey(false)}
            style={{ flex: 1, padding: '12px 6px', background: '#374151', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', opacity: busy ? 0.6 : 1 }}>
            조사표 다운로드
          </button>
          <button type="button" disabled={busy} onClick={() => exportSurvey(true)}
            style={{ flex: 1, padding: '12px 6px', background: '#b45309', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', opacity: busy ? 0.6 : 1 }}>
            {busy ? '처리 중…' : '다운로드 후 초기화'}
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#9ca3af' }}>
          초기화해도 기록은 삭제되지 않고 DB에 보관되며, 다음 측정은 No.1부터 시작합니다.
        </p>
      </section>

      <a href={SURVEY_URL} target="_blank" rel="noopener"
        style={{ display: 'block', marginTop: '20px', padding: '12px', textAlign: 'center', background: '#173f5f', color: '#fff', borderRadius: '5px', fontWeight: 'bold', textDecoration: 'none' }}>
        📋 기초조사표 열기 (측정값 가져오기)
      </a>
    </div>
  );
}

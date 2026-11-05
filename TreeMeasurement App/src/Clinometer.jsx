import React, { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// 기울기(측고기) 측정
//  수고   = D × (tan θ꼭대기 − tan θ밑동)
//  지하고 = D × (tan θ가지 − tan θ밑동)
//  수관폭 ≈ 2 × D × tan(Δ방위/2)   (수관 좌우 끝을 겨눈 수평 각도 차)
//  D = 나무까지의 수평거리(m)
// ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const SAMPLES = 15; // 최근 약 0.25~0.5초 평균 (손떨림 완화)

/** 기기 방향(alpha, beta, gamma) → 후면 카메라가 향하는 고도각·방위각 */
function cameraAngles(alpha, beta, gamma) {
  const a = (alpha || 0) * DEG, b = (beta || 0) * DEG, g = (gamma || 0) * DEG;
  // 후면 카메라 방향 = 기기 -Z 축 (W3C Z-X'-Y'' 회전)
  const cx = -(Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g));
  const cy = -(Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g));
  const cz = -Math.cos(b) * Math.cos(g);
  const elevation = Math.asin(Math.max(-1, Math.min(1, cz))) / DEG;
  let heading = Math.atan2(cx, cy) / DEG;
  if (heading < 0) heading += 360;
  return { elevation, heading };
}

const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
/** 각도 평균 (359°와 1°의 평균이 0°가 되도록) */
const avgAngle = (arr) => {
  if (!arr.length) return null;
  const s = arr.reduce((acc, v) => acc + Math.sin(v * DEG), 0);
  const c = arr.reduce((acc, v) => acc + Math.cos(v * DEG), 0);
  let d = Math.atan2(s, c) / DEG;
  if (d < 0) d += 360;
  return d;
};
const angleDiff = (a, b) => ((b - a + 540) % 360) - 180; // -180~180
// 소수점 첫째 자리 반올림 (부동소수 오차 보정: 1.05 → 1.1)
const round1 = (v) => Math.round((v + Math.sign(v) * Number.EPSILON) * 10) / 10;
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(d));

const STEPS = [
  { key: 'base', label: '① 밑동', kind: 'elev' },
  { key: 'top', label: '② 꼭대기', kind: 'elev' },
  { key: 'branch', label: '③ 가지 시작점', kind: 'elev' },
  { key: 'crownL', label: '④ 수관 왼쪽 끝', kind: 'head' },
  { key: 'crownR', label: '⑤ 수관 오른쪽 끝', kind: 'head' },
];

const btn = (bg) => ({
  padding: '12px 8px', background: bg, color: '#fff', border: 'none',
  borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer',
});

export default function Clinometer({ onApply }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const buf = useRef({ elev: [], head: [], compass: [] });
  const gotEvent = useRef(false);

  const [running, setRunning] = useState(false);
  const [live, setLive] = useState({ elev: null, head: null, compass: null });
  const [camError, setCamError] = useState('');
  const [sensorError, setSensorError] = useState('');
  const [distance, setDistance] = useState('');
  const [rec, setRec] = useState({});
  const [note, setNote] = useState('');

  // ── 센서 이벤트 ─────────────────────────────
  useEffect(() => {
    if (!running) return;

    const push = (key, v) => {
      const a = buf.current[key];
      a.push(v);
      if (a.length > SAMPLES) a.shift();
    };

    const onOrient = (e) => {
      if (e.beta === null || e.beta === undefined) return;
      gotEvent.current = true;
      const { elevation, heading } = cameraAngles(e.alpha, e.beta, e.gamma);
      push('elev', elevation);
      push('head', heading); // 상대 방위 (수관폭 계산용 — 차이만 사용)
      // 절대 방위 (방위각): iOS = webkitCompassHeading, Android = absolute 이벤트
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        push('compass', e.webkitCompassHeading);
      } else if (e.absolute || e.type === 'deviceorientationabsolute') {
        push('compass', heading);
      }
    };

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient);

    const timer = setInterval(() => {
      setLive({
        elev: avg(buf.current.elev),
        head: avgAngle(buf.current.head),
        compass: avgAngle(buf.current.compass),
      });
    }, 100);

    const check = setTimeout(() => {
      if (!gotEvent.current) setSensorError('기울기 센서 값을 받지 못했습니다. 휴대폰(아이폰 Safari)에서 열어 주세요.');
    }, 2500);

    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('deviceorientationabsolute', onOrient);
      clearInterval(timer);
      clearTimeout(check);
    };
  }, [running]);

  // 화면을 벗어나면 카메라 끄기
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // ── 시작 (아이폰은 반드시 버튼을 눌러서 권한 요청) ──
  const start = async () => {
    setSensorError('');
    setCamError('');
    try {
      // iOS 13+ : 사용자 터치 직후에 바로 호출해야 함
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'denied') {
          setSensorError('동작 및 방향 접근이 거부되었습니다. Safari 설정에서 허용 후 새로고침하세요.');
          return;
        }
      }
    } catch (e) {
      setSensorError('센서 권한 요청 실패: ' + (e?.message ?? e));
      return;
    }
    setRunning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setCamError('카메라를 열 수 없어 화면 없이 측정합니다. (폰 윗면 모서리로 겨누세요)');
    }
  };

  // ── 기록 ─────────────────────────────
  const record = (step) => {
    setNote('');
    const elev = avg(buf.current.elev);
    const head = avgAngle(buf.current.head);
    if (elev === null) return setNote('센서 값이 아직 없습니다.');
    if (step.kind === 'elev' && Math.abs(elev) > 85)
      return setNote('각도가 너무 큽니다(±85° 초과). 나무에서 더 멀리 떨어지세요.');
    const entry = { elev, head };
    if (step.key === 'base') entry.compass = avgAngle(buf.current.compass);
    setRec((r) => ({ ...r, [step.key]: entry }));
  };

  // ── 계산 ─────────────────────────────
  const D = parseFloat(distance);
  const hasD = Number.isFinite(D) && D > 0;
  const tan = (deg) => Math.tan(deg * DEG);

  const height = hasD && rec.base && rec.top ? D * (tan(rec.top.elev) - tan(rec.base.elev)) : null;
  const clear = hasD && rec.base && rec.branch ? D * (tan(rec.branch.elev) - tan(rec.base.elev)) : null;
  const dPsi = rec.crownL && rec.crownR ? Math.abs(angleDiff(rec.crownL.head, rec.crownR.head)) : null;
  const crown = hasD && dPsi !== null && dPsi < 170 ? 2 * D * tan(dPsi / 2) : null;
  const azimuth = rec.base?.compass ?? null;

  let warn = '';
  if (height !== null && height <= 0) warn = '꼭대기 각도가 밑동보다 낮습니다. 다시 측정하세요.';
  else if (clear !== null && height !== null && (clear < 0 || clear > height)) warn = '지하고가 0~수고 범위를 벗어났습니다.';

  const apply = () => {
    if (!hasD) return setNote('먼저 나무까지의 수평거리를 입력하세요.');
    if (height === null || height <= 0) return setNote('밑동과 꼭대기를 먼저 측정하세요.');
    onApply({
      height: round1(height).toFixed(1),
      clearLength: clear !== null && clear >= 0 && clear <= height ? round1(clear).toFixed(1) : '',
      crownWidth: crown !== null ? round1(crown).toFixed(1) : '',
      azimuth: azimuth !== null ? String(Math.round(azimuth) % 360) : '',
    });
    setNote('✅ 아래 입력란에 적용했습니다. 흉고직경을 입력하고 저장하세요.');
  };

  const reset = () => { setRec({}); setNote(''); };

  // ── 화면 ─────────────────────────────
  return (
    <section style={{ background: '#1c1c1e', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 10px' }}>📐 기울기 센서로 측정</h3>

      {!running ? (
        <>
          <ol style={{ margin: '0 0 12px', paddingLeft: '20px', fontSize: '14px', lineHeight: 1.6, color: '#d1d5db' }}>
            <li>나무에서 10~20 m 떨어져 <b>수평거리</b>를 줄자·걸음으로 잽니다.</li>
            <li>폰을 세워 십자선을 <b>밑동 → 꼭대기 → 가지 시작점</b>에 맞추고 버튼을 누릅니다.</li>
            <li>(선택) 수관 왼쪽·오른쪽 끝을 겨눠 수관폭을 잽니다.</li>
            <li><b>입력란에 적용</b> → 흉고직경 입력 → 저장</li>
          </ol>
          <button type="button" onClick={start} style={{ ...btn('#2563eb'), width: '100%' }}>
            센서·카메라 시작
          </button>
          {sensorError && <p style={{ color: '#f87171', fontSize: '13px' }}>{sensorError}</p>}
        </>
      ) : (
        <>
          {/* 카메라 + 십자선 */}
          <div style={{ position: 'relative', width: '100%', height: '42vh', minHeight: '220px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', marginLeft: '-1px', background: 'rgba(255,60,60,0.9)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', marginTop: '-1px', background: 'rgba(255,60,60,0.9)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: '28px', height: '28px', margin: '-14px 0 0 -14px', border: '2px solid #ff3c3c', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '16px' }}>
              기울기 {fmt(live.elev)}°<br />
              방위 {live.compass !== null ? fmt(live.compass, 0) + '°' : '–'}
            </div>
          </div>

          {camError && <p style={{ color: '#fbbf24', fontSize: '13px' }}>{camError}</p>}
          {sensorError && <p style={{ color: '#f87171', fontSize: '13px' }}>{sensorError}</p>}

          <label style={{ display: 'block', marginTop: '12px' }}>
            나무까지 수평거리 D (m):
            <input type="number" inputMode="decimal" step="any" min="0" value={distance}
              onChange={(e) => setDistance(e.target.value)} placeholder="예: 15"
              style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
            {STEPS.map((s) => {
              const r = rec[s.key];
              return (
                <button key={s.key} type="button" onClick={() => record(s)}
                  style={{ ...btn(r ? '#065f46' : '#374151'), gridColumn: s.key === 'base' ? '1 / span 2' : undefined }}>
                  {s.label}
                  <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '2px' }}>
                    {r ? (s.kind === 'elev' ? `✓ ${fmt(r.elev)}°` : `✓ 방향 기록`) : '겨누고 누르기'}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: '12px', background: '#111', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.7 }}>
            수고   : {height !== null ? fmt(round1(height), 1) + ' m' : '–'}<br />
            지하고 : {clear !== null ? fmt(round1(clear), 1) + ' m' : '–'}<br />
            수관폭 : {crown !== null ? fmt(round1(crown), 1) + ' m (추정)' : '–'}<br />
            방위각 : {azimuth !== null ? fmt(azimuth, 0) + '°' : '–'}
          </div>
          {!hasD && Object.keys(rec).length > 0 && (
            <p style={{ color: '#fbbf24', fontSize: '13px' }}>수평거리 D를 입력해야 계산됩니다.</p>
          )}
          {warn && <p style={{ color: '#f87171', fontSize: '13px' }}>{warn}</p>}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" onClick={reset} style={{ ...btn('#4b5563'), flex: 1 }}>다시 측정</button>
            <button type="button" onClick={apply} style={{ ...btn('#2563eb'), flex: 2 }}>입력란에 적용 ↓</button>
          </div>
          {note && <p style={{ fontSize: '14px', color: note.startsWith('✅') ? '#4ade80' : '#fbbf24' }}>{note}</p>}
        </>
      )}
    </section>
  );
}

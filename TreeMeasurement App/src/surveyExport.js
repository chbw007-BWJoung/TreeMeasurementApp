// 측정 기록 → 기초현황조사표(I형 집단목) 엑셀 파일
// 열 구성·머리글·서식은 수목진단 앱의 기초조사표(survey/index.html) '엑셀 저장'과 같습니다.

const G = [
  ['', [['No.']]], ['', [['수종']]],
  ['수목형상', [['수고', '(m)'], ['흉고\n직경', '(cm)'], ['수관폭', '(m)'], ['지하고', '(m)']]],
  ['줄기부 결함', [['균열\n부후\n공동'], ['가지\n고사'], ['가지\n찢어짐'], ['기타']]],
  ['뿌리부 결함', [['균열\n부후\n공동'], ['뿌리\n절단'], ['뿌리\n조임\n병목'], ['기타']]],
  ['줄기 기울기', [['기울기', '( °)'], ['방향'], ['수간형']]],
  ['피해 대상물', [['존재'], ['부존재']]],
  ['활력도', [['방식 선택']]],
  ['', [['예비\n평가']]], ['', [['비고']]],
];
const NCOL = G.reduce((n, g) => n + g[1].length, 0); // 22
const COL = { no: 0, sp: 1, h: 2, dbh: 3, crown: 4, clear: 5, note: NCOL - 1 };

const r1 = (v) => (v === null || v === undefined || v === '' || Number.isNaN(+v)
  ? null : Math.round((+v + Math.sign(+v) * Number.EPSILON) * 10) / 10);

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 같은 No.가 여러 건이면 최신 기록만 남기고, No. 순으로 행 배치 */
export function arrangeRows(records) {
  const byNo = new Map();
  const noNo = [];
  [...records]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((x) => {
      const n = parseInt(x.tree_no, 10);
      if (n >= 1 && n <= 500) byNo.set(n, x); else noNo.push(x);
    });
  const maxNo = byNo.size ? Math.max(...byNo.keys()) : 0;
  const rows = [];
  for (let n = 1; n <= maxNo; n++) rows.push({ no: n, rec: byNo.get(n) || null });
  noNo.forEach((x) => rows.push({ no: '', rec: x })); // 번호 없는 예전 기록은 뒤에
  while (rows.length < 30) rows.push({ no: rows.length + 1, rec: null }); // 양식처럼 최소 30행
  return rows;
}

export async function downloadSurveyXlsx(records) {
  const mod = await import('xlsx-js-style');
  const XLSX = mod.default || mod;

  const dates = records.map((x) => new Date(x.created_at)).sort((a, b) => a - b);
  const d0 = dates.length ? ymd(dates[0]) : ymd(new Date());
  const d1 = dates.length ? ymd(dates[dates.length - 1]) : d0;
  const dateText = d0 === d1 ? d0 : `${d0} ~ ${d1}`;

  const aoa = [];
  aoa.push(['기초현황조사표(I형 집단목)']);
  aoa.push([`기본정보 :  / 날짜 : ${dateText} / 조사자 : `]);

  const groupRow = [], subRow = [], merges = [];
  let ci = 0;
  G.forEach(([grp, items]) => {
    const start = ci;
    if (!grp) {
      items.forEach((c) => { groupRow[ci] = c[0].replace(/\n/g, ' '); subRow[ci] = ''; merges.push({ s: { r: 2, c: ci }, e: { r: 3, c: ci } }); ci++; });
    } else {
      groupRow[start] = grp;
      if (items.length > 1) merges.push({ s: { r: 2, c: start }, e: { r: 2, c: start + items.length - 1 } });
      items.forEach((c) => { subRow[ci] = c[0].replace(/\n/g, ' ') + (c[1] ? '\n' + c[1] : ''); ci++; });
    }
  });
  aoa.push(groupRow, subRow);

  const rows = arrangeRows(records);
  rows.forEach(({ no, rec }) => {
    const line = Array(NCOL).fill('');
    line[COL.no] = no;
    if (rec) {
      line[COL.sp] = rec.species || '';
      line[COL.h] = r1(rec.height) ?? '';
      line[COL.dbh] = r1(rec.dbh) ?? '';
      line[COL.crown] = r1(rec.crown_width) ?? '';
      line[COL.clear] = r1(rec.clear_length) ?? '';
      if (rec.azimuth !== null && rec.azimuth !== undefined) line[COL.note] = `방위 ${rec.azimuth}°`;
    }
    aoa.push(line);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NCOL - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } }, ...merges];
  ws['!cols'] = Array.from({ length: NCOL }, (_, i) => ({ wch: i === 0 ? 5 : i === 1 ? 12 : i === NCOL - 1 ? 14 : 9 }));
  ws['!rows'] = [{ hpt: 25 }, { hpt: 22 }, { hpt: 26 }, { hpt: 42 }, ...rows.map(() => ({ hpt: 25 }))];

  const border = ['top', 'bottom', 'left', 'right'].reduce((o, k) => ({ ...o, [k]: { style: 'thin', color: { rgb: '555555' } } }), {});
  const headerFill = { patternType: 'solid', fgColor: { rgb: 'E6E6E6' } };
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < NCOL; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = { font: { name: '맑은 고딕', sz: r < 4 ? 10 : 9, bold: r < 4 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border };
      if (r < 4) ws[addr].s.fill = headerFill;
      // 측정값은 X.X 형식으로 표시
      if (r >= 4 && c >= COL.h && c <= COL.clear && ws[addr].t === 'n') ws[addr].z = '0.0';
    }
  }
  ws.A1.s = { font: { name: '맑은 고딕', sz: 15, bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, fill: headerFill, border };
  ws.A2.s = { font: { name: '맑은 고딕', sz: 10 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '기초현황조사표');
  const fname = `기초현황조사표_${d0 === d1 ? d0 : d0 + '_' + d1}.xlsx`;
  // 파일명을 확실히 지정하기 위해 직접 내려받기 (iPhone Safari 포함)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return fname;
}

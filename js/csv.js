/**
 * CSV入出力
 * 1行 = HAWB 1件。MAWBの便情報も同じ行に並べます。
 * 配下HAWBが無いMAWBは、HAWB番号を空欄にした1行で出力します。
 * Excelで開いても文字化けしないよう BOM付きUTF-8 で出力します。
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;

  // 輸出・輸入の工程名を重複なく並べる（請求・完了は共通）
  function allSteps() {
    const seen = {}, list = [];
    ['EXPORT', 'IMPORT'].forEach((dir) => cfg.WORKFLOWS[dir].forEach((w) => {
      if (!seen[w.code]) { seen[w.code] = true; list.push(w); }
    }));
    return list;
  }

  const BASE_COLS = [
    ['輸出入区分', 'direction'], ['MAWB番号', 'mawbNo'], ['航空会社', 'airline'], ['1st便名', 'flightNo'], ['1st便 日付', 'flightDate'],
    ['2nd便名', 'flight2No'], ['2nd便 日付', 'flight2Date'], ['経由地', 'transit'],
    ['出発地', 'origin'], ['到着地', 'destination'], ['ETD', 'etd'], ['ETA', 'eta'],
    ['HAWB番号', 'hawbNo'], ['荷主（輸出者）', 'shipper'], ['荷受人（輸入者）', 'consignee'],
    ['個数', 'pieces'], ['重量(kg)', 'weightKg'], ['容積重量(kg)', 'volumeWeightKg'], ['品名', 'commodity'],
    ['担当者', 'assignee'],
    ['危険品', 'dg'], ['危険品内容', 'dgNote'], ['保冷品', 'reefer'], ['保冷品内容', 'reeferNote'],
    ['その他特殊', 'other'], ['その他特殊内容', 'otherNote'],
    ['メモ', 'memo'], ['現在ステータス（参考）', '_status'],
  ];

  function headers() {
    const h = BASE_COLS.map((c) => c[0]);
    allSteps().forEach((w) => { h.push('予定日_' + w.name); h.push('実績_' + w.name); });
    return h;
  }

  function cell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const CSV = {};

  CSV.exportText = function (snap) {
    const steps = allSteps();
    const rows = [headers()];
    const byMawb = {};
    snap.hawbs.forEach((h) => { (byMawb[h.mawbId] = byMawb[h.mawbId] || []).push(h); });
    const sorted = snap.mawbs.slice().sort((a, b) => a.mawbNo.localeCompare(b.mawbNo));
    sorted.forEach((m) => {
      const children = byMawb[m.id] || [null];
      children.forEach((h) => {
        const sp = (h && h.special) || {};
        const v = {
          direction: M.dirLabel(m.direction), mawbNo: m.mawbNo, airline: m.airline, flightNo: m.flightNo,
          flightDate: m.flightDate || '', flight2No: m.flight2No || '', flight2Date: m.flight2Date || '', transit: m.transit || '',
          origin: m.origin, destination: m.destination, etd: U.dtToCsv(m.etd), eta: U.dtToCsv(m.eta),
        };
        if (h) {
          Object.assign(v, {
            hawbNo: h.hawbNo, shipper: h.shipper, consignee: h.consignee,
            pieces: h.pieces, weightKg: h.weightKg, volumeWeightKg: h.volumeWeightKg,
            commodity: h.commodity, assignee: h.assignee,
            dg: sp.dg ? '○' : '', dgNote: sp.dgNote, reefer: sp.reefer ? '○' : '', reeferNote: sp.reeferNote,
            other: sp.other ? '○' : '', otherNote: sp.otherNote, memo: h.memo,
            _status: M.progress(h, m.direction).currentName,
          });
        }
        const row = BASE_COLS.map((c) => v[c[1]]);
        const stepMap = {};
        if (h) h.steps.forEach((s) => { stepMap[s.code] = s; });
        steps.forEach((w) => {
          const s = stepMap[w.code];
          row.push(s ? s.plannedDate : '');
          row.push(s ? U.dtToCsv(s.actualAt) : '');
        });
        rows.push(row);
      });
    });
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  };

  /** CSV文字列を2次元配列に（ダブルクォート・改行入りセル対応） */
  CSV.parse = function (text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  };

  const truthy = (v) => /^(○|◯|1|true|yes|y|はい|有|あり|x|✓)$/i.test(String(v || '').trim());
  const parseDir = (v) => {
    v = String(v || '').trim().toUpperCase();
    if (v === '輸出' || v === 'EXPORT' || v === 'EXP' || v === 'E') return 'EXPORT';
    if (v === '輸入' || v === 'IMPORT' || v === 'IMP' || v === 'I') return 'IMPORT';
    return null;
  };

  /**
   * 取込内容を解析して、反映予定のデータと件数を返す（まだ保存はしない）
   * MAWB番号＋HAWB番号で既存データと照合し、あれば更新・なければ追加
   */
  CSV.plan = function (text, snap, mode) {
    const rows = CSV.parse(text);
    const result = { errors: [], warnings: [], mawbs: [], hawbs: [], counts: { mawbAdd: 0, mawbUpd: 0, hawbAdd: 0, hawbUpd: 0 } };
    if (rows.length < 2) { result.errors.push('データ行がありません。'); return result; }

    const head = rows[0].map((h) => String(h).trim());
    const col = {};
    head.forEach((h, i) => { col[h] = i; });
    if (col['MAWB番号'] === undefined) { result.errors.push('「MAWB番号」列が見つかりません。このアプリから出力したCSVの形式で取り込んでください。'); return result; }
    const get = (r, name) => (col[name] === undefined ? '' : String(r[col[name]] === undefined ? '' : r[col[name]]).trim());

    const base = mode === 'replace' ? { mawbs: [], hawbs: [] } : snap;
    const existMawb = {};
    base.mawbs.forEach((m) => { existMawb[m.mawbNo] = m; });
    const existHawb = {};
    base.hawbs.forEach((h) => { existHawb[h.hawbNo] = h; });

    const newMawbs = {}; // mawbNo -> mawb
    const newHawbs = {}; // hawbNo -> hawb
    const steps = allSteps();

    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const chk = U.checkMawbNo(get(r, 'MAWB番号'));
      if (!chk.formatOk) { result.errors.push(line + '行目：MAWB番号の形式が正しくありません（例：131-12345675）'); return; }
      const mawbNo = chk.normalized;
      if (!chk.checkOk) result.warnings.push(line + '行目：MAWB番号 ' + mawbNo + ' のチェックデジットが一致しません（そのまま取り込みます）');

      let m = newMawbs[mawbNo];
      if (!m) {
        const dir = parseDir(get(r, '輸出入区分'));
        if (!dir) { result.errors.push(line + '行目：輸出入区分は「輸出」または「輸入」で入力してください'); return; }
        const etd = U.normalizeDateTime(get(r, 'ETD'));
        const eta = U.normalizeDateTime(get(r, 'ETA'));
        if (etd === null || eta === null) { result.errors.push(line + '行目：ETD/ETAの日付形式が正しくありません'); return; }
        const f1d = U.normalizeDate(get(r, '1st便 日付'));
        const f2d = U.normalizeDate(get(r, '2nd便 日付'));
        if (f1d === null || f2d === null) { result.errors.push(line + '行目：便の日付形式が正しくありません'); return; }
        const f2 = get(r, '2nd便名').toUpperCase();
        const old = existMawb[mawbNo];
        m = {
          id: old ? old.id : U.uid('m'), mawbNo, direction: dir,
          airline: get(r, '航空会社').toUpperCase(), flightNo: (get(r, '1st便名') || get(r, '便名')).toUpperCase(),
          flightDate: f1d || (etd || '').slice(0, 10),
          flight2No: f2, flight2Date: f2 ? f2d : '', transit: f2 ? get(r, '経由地').toUpperCase() : '',
          origin: get(r, '出発地').toUpperCase(), destination: get(r, '到着地').toUpperCase(),
          etd, eta,
        };
        newMawbs[mawbNo] = m;
        result.mawbs.push(m);
        old ? result.counts.mawbUpd++ : result.counts.mawbAdd++;
      }

      const hawbNo = get(r, 'HAWB番号');
      if (!hawbNo) return; // MAWBのみの行
      if (newHawbs[hawbNo]) { result.errors.push(line + '行目：HAWB番号 ' + hawbNo + ' がCSV内で重複しています'); return; }
      const old = existHawb[hawbNo];
      if (old && old.mawbId !== m.id) {
        result.errors.push(line + '行目：HAWB番号 ' + hawbNo + ' は別のMAWBに登録済みです'); return;
      }
      const stepList = [];
      let bad = false;
      steps.forEach((w) => {
        const p = U.normalizeDate(get(r, '予定日_' + w.name));
        const a = U.normalizeDateTime(get(r, '実績_' + w.name));
        if (p === null || a === null) bad = true;
        stepList.push({ code: w.code, plannedDate: p || '', actualAt: a || '' });
      });
      if (bad) { result.errors.push(line + '行目：工程の予定日・実績の日付形式が正しくありません'); return; }

      const h = {
        id: old ? old.id : U.uid('h'), mawbId: m.id, hawbNo,
        shipper: get(r, '荷主（輸出者）'), consignee: get(r, '荷受人（輸入者）'),
        pieces: U.num(get(r, '個数')), weightKg: U.num(get(r, '重量(kg)')), volumeWeightKg: U.num(get(r, '容積重量(kg)')),
        commodity: get(r, '品名'), assignee: get(r, '担当者'),
        special: {
          dg: truthy(get(r, '危険品')), dgNote: get(r, '危険品内容'),
          reefer: truthy(get(r, '保冷品')), reeferNote: get(r, '保冷品内容'),
          other: truthy(get(r, 'その他特殊')), otherNote: get(r, 'その他特殊内容'),
        },
        memo: get(r, 'メモ'),
        steps: stepList,
      };
      M.normalizeSteps(h, m.direction, m);
      // 工程は順番に進むため、途中が抜けた実績は警告
      let gap = false, seenEmpty = false;
      h.steps.forEach((s) => { if (!s.actualAt) seenEmpty = true; else if (seenEmpty) gap = true; });
      if (gap) result.warnings.push(line + '行目：HAWB ' + hawbNo + ' の実績に抜けがあります（抜けた工程から先は未完了として扱います）');

      newHawbs[hawbNo] = h;
      result.hawbs.push(h);
      old ? result.counts.hawbUpd++ : result.counts.hawbAdd++;
    });
    return result;
  };

  App.csv = CSV;
})(window.App);

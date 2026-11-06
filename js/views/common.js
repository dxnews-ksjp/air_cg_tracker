/**
 * 画面部品（バッジ・ラベル・進捗バーなど）
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;
  const esc = U.esc;

  const UI = {};

  UI.dirBadge = (dir) =>
    '<span class="badge dir-' + dir.toLowerCase() + '">' + esc(M.dirLabel(dir)) + '</span>';

  /** 特殊貨物ラベル。full=true で内容も表示 */
  UI.specialLabels = function (h, full) {
    const sp = h.special || {};
    return cfg.SPECIALS.filter((s) => sp[s.key]).map((s) => {
      const note = sp[s.key + 'Note'] || '';
      return '<span class="sp-label ' + s.cls + '" title="' + esc(s.label + (note ? '：' + note : '')) + '">' +
        '<span class="sp-icon" aria-hidden="true">' + s.short + '</span>' + esc(s.label) +
        (full && note ? '<span class="sp-note">' + esc(note) + '</span>' : '') + '</span>';
    }).join('');
  };

  /** MAWB用：配下にある特殊貨物の種類をまとめて小さく表示 */
  UI.specialIcons = function (specials) {
    return cfg.SPECIALS.filter((s) => specials[s.key]).map((s) =>
      '<span class="sp-mini ' + s.cls + '" title="配下に' + esc(s.label) + 'あり">' + s.short + '</span>').join('');
  };

  UI.alertBadge = function (a) {
    if (a.level === 'overdue') {
      return '<span class="alert-badge overdue" title="遅延工程：' + esc(a.overdueSteps.join('、')) + '">⚠ ' + a.overdueDays + '日遅延</span>';
    }
    if (a.level === 'soon') {
      return '<span class="alert-badge soon" title="期限間近：' + esc(a.soonSteps.join('、')) + '">⏰ 期限間近</span>';
    }
    return '';
  };

  UI.progressBar = function (p) {
    return '<span class="pbar" role="img" aria-label="進捗 ' + p.done + '/' + p.total + '">' +
      '<span class="pbar-fill' + (p.complete ? ' done' : '') + '" style="width:' + p.pct + '%"></span></span>';
  };

  UI.statusText = function (p) {
    if (p.complete) return '<span class="status done">✓ 完了</span>';
    return '<span class="status">' + esc(p.currentName) + '</span>';
  };

  UI.stateBadge = function (state) {
    return '<span class="st-badge st-' + state + '">' + esc(M.STATE_LABEL[state]) + '</span>';
  };

  /** 区間（経由地があれば 出発地→経由地→到着地） */
  UI.route = function (m) {
    return [m.origin || '???', m.flight2No && m.transit ? m.transit : null, m.destination || '???']
      .filter(Boolean).map(esc).join('→');
  };

  /** 1ST FLT / 2ND FLT（便名と日付）。日付が未入力の1ST FLTはETDの日付を使う */
  UI.flightText = function (no, date) {
    if (!no) return '<span class="muted">—（直行便）</span>';
    return '<strong>' + esc(no) + '</strong>' + (date ? ' / ' + U.fmtDate(date) : '');
  };
  UI.flights = function (m) {
    return '<span><em>1ST FLT</em>' + UI.flightText(m.flightNo || m.airline || '', m.flightDate || (m.etd || '').slice(0, 10)) + '</span>' +
      '<span><em>2ND FLT</em>' + UI.flightText(m.flight2No, m.flight2Date) + '</span>';
  };

  /** 次の工程と予定日（一覧用） */
  UI.nextStep = function (p, today) {
    if (!p.next) return '<span class="muted">—</span>';
    const st = M.stepState({ plannedDate: p.next.plannedDate, actualAt: '' }, today);
    return '<span class="next-step st-text-' + st + '">次：' + esc(p.next.name) +
      (p.next.plannedDate ? '（' + U.fmtDate(p.next.plannedDate) + '）' : '') + '</span>';
  };

  /**
   * 横並びの工程バー（一覧用）。工程名と日付だけをシンプルに表示
   * 日付：完了した工程は実績日、未完了の工程は予定日
   */
  UI.stepStrip = function (h, dir, today) {
    const wf = M.workflow(dir);
    const p = M.progress(h, dir);
    const md = (s) => (s ? s.slice(5, 10).replace('-', '/') : '—');
    const item = (w, i) => {
      const s = (h.steps || [])[i] || {};
      const st = M.stepState(s, today);
      const isNext = p.next && p.next.idx === i;
      const date = s.na ? '-' : (s.actualAt ? md(s.actualAt) : md(s.plannedDate));
      const tip = w.name + '　予定：' + (s.plannedDate ? U.fmtDate(s.plannedDate) : '未設定') +
        (s.actualAt ? '　実績：' + U.fmtDT(s.actualAt) : '') + '（' + M.STATE_LABEL[st] + '）';
      return '<li class="ss ss-' + st + (isNext ? ' is-next' : '') + '" title="' + esc(tip) + '">' +
        '<span class="ss-name">' + esc(w.name) + '</span><span class="ss-date">' + date + '</span></li>';
    };
    // 一覧ではブロック（国内・国際など）の見出しは付けずに、工程を1列に並べる
    return '<ol class="step-strip" aria-label="工程">' + wf.map((w, i) => item(w, i)).join('') + '</ol>';
  };

  UI.markDot = function (color, attrs) {
    const c = cfg.MARK_COLORS.find((x) => x.code === (color || '')) || cfg.MARK_COLORS[0];
    return '<button type="button" class="mark-dot mark-' + (c.code || 'none').toLowerCase() + '" ' + (attrs || '') +
      ' title="自分チェック：' + esc(c.label) + '（クリックで切替）" aria-label="自分チェック：' + esc(c.label) + '"></button>';
  };

  UI.empty = (msg) => '<div class="empty">' + esc(msg) + '</div>';

  App.ui = UI;
  App.views = App.views || {};
})(window.App);

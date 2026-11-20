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
  /** MAWB用：配下にある特殊貨物の種類を「危険品」「保冷品」などの角丸ラベルで表示 */
  UI.specialTags = function (specials) {
    return cfg.SPECIALS.filter((s) => specials[s.key]).map((s) =>
      '<span class="sp-tag ' + s.cls + '" title="配下に' + esc(s.label) + 'あり">' + esc(s.label) + '</span>').join('');
  };

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
      const st = M.stepState(s, today, i, p);
      const c = M.colorState(s, today, i, p);
      const date = s.na ? '-' : (s.actualAt ? md(s.actualAt) : md(s.plannedDate));
      const tip = w.name + '　予定：' + (s.plannedDate ? U.fmtDate(s.plannedDate) : '未設定') +
        (s.actualAt ? '　実績：' + U.fmtDT(s.actualAt) : '') + '（' + (c === 'na' ? M.STATE_LABEL[st] : M.COLOR_LABEL[c]) + '）';
      return '<li class="ss ss-' + c + '" title="' + esc(tip) + '">' +
        '<span class="ss-name">' + esc(w.name) + '</span><span class="ss-date">' + date + '</span></li>';
    };
    // 一覧ではブロック（国内・国際など）の見出しは付けずに、工程を1列に並べる
    // hideInList の工程（受注）は一覧には出さない（HAWB詳細には表示）
    return '<ol class="step-strip" aria-label="工程">' + wf.map((w, i) => (w.hideInList ? '' : item(w, i))).join('') + '</ol>';
  };

  /** 色分けの凡例 */
  UI.colorLegend = function () {
    return '<span class="legend">' + ['done', 'active', 'overdue', 'na'].map((c) =>
      '<span class="lg-ss ss-' + c + '">' + esc(M.COLOR_LABEL[c]) + '</span>').join('') + '</span>';
  };

  UI.colorBadge = function (c, label) {
    return '<span class="st-badge cb-' + c + '">' + esc(label || M.COLOR_LABEL[c]) + '</span>';
  };

  UI.markDot = function (color, attrs) {
    const c = cfg.MARK_COLORS.find((x) => x.code === (color || '')) || cfg.MARK_COLORS[0];
    return '<button type="button" class="mark-dot mark-' + (c.code || 'none').toLowerCase() + '" ' + (attrs || '') +
      ' title="自分チェック：' + esc(c.label) + '（クリックで切替）" aria-label="自分チェック：' + esc(c.label) + '"></button>';
  };

  /**
   * AIアシスタント（キャラクター＋吹き出し）。今日のまとめと気づきを表示する
   * 左の .ai-avatar にAIキャラクターのイラストを後から差し込む予定
   */
  UI.assistant = function (snap, today) {
    const r = App.assistant.build(snap, today);
    const t = r.at.slice(11, 16);
    const line = (x) => '<li class="as-line' + (x.level ? ' as-' + x.level : '') + '">' +
      '<span>' + esc(x.text) + '</span>' +
      (x.href ? ' <a href="' + x.href + '" class="as-link">' + (x.href === '#/tasks' ? 'タスク管理を開く' : '詳細を開く') + ' ›</a>' : '') + '</li>';
    const notice = (n) => '<li class="as-notice">' +
      '<span class="as-icon" aria-hidden="true">⚠</span>' +
      '<span class="as-text">' + esc(n.text) + ' <a href="' + n.href + '" class="as-link">詳細を開く ›</a></span>' +
      '<span class="as-btns"><button type="button" class="btn btn-sm" data-notice-ack="' + esc(n.key) + '" data-status="checked">確認済み</button>' +
      '<button type="button" class="btn btn-sm btn-link" data-notice-ack="' + esc(n.key) + '" data-status="dismissed">対応不要</button></span></li>';
    return '<section class="assistant" aria-label="AIアシスタントからのお知らせ">' +
      '<div class="ai-avatar" data-slot="ai-character" aria-hidden="true"><span>AIキャラ<br>イラスト<br>挿入予定</span></div>' +
      '<div class="as-bubbles">' +
        '<div class="as-bubble">' +
          '<div class="as-head"><strong>今日のまとめ</strong><span class="as-time">' + U.fmtDate(today) + ' ' + t + ' 時点</span></div>' +
          '<ul class="as-list">' + r.summary.map(line).join('') + '</ul>' +
        '</div>' +
        '<div class="as-bubble">' +
          '<div class="as-head"><strong>気づいたこと</strong><span class="as-tag">参考情報</span>' +
            (r.hiddenCount ? '<button type="button" class="btn btn-sm btn-link as-reset" data-notice-reset>確認済み・対応不要にした ' + r.hiddenCount + ' 件を再表示</button>' : '') + '</div>' +
          (r.notices.length
            ? '<ul class="as-list">' + r.notices.map(notice).join('') + '</ul>' +
              (r.more ? '<p class="as-more">ほかに ' + r.more + ' 件あります（確認すると次のお知らせが表示されます）</p>' : '')
            : '<p class="as-none">いま気づいたことはありません。※お知らせがないことは「問題なし」を保証するものではありません。</p>') +
        '</div>' +
        '<p class="as-foot">デモ版：AIには接続せず、登録データからルールで作成しています。本番では文章をAIが作成し、件数・番号・日付はシステムが入れる想定です。</p>' +
      '</div>' +
    '</section>';
  };

  /** タイトル横に表示する注意事項（赤字・太字） */
  UI.disclaimer = () => '<p class="disclaimer" role="note">※この画面はあくまでもイメージ共有を目的としてAIが作成したものであり、この通りに開発できることを保証するものではありません。</p>';

  UI.empty = (msg) => '<div class="empty">' + esc(msg) + '</div>';

  App.ui = UI;
  App.views = App.views || {};
})(window.App);

/**
 * 共通ユーティリティ（日付計算・文字列エスケープ・モーダル・トーストなど）
 */
(function (App) {
  'use strict';

  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const pad = (n) => String(n).padStart(2, '0');

  const U = {};

  /** HTMLエスケープ（ユーザー入力を画面に出すときは必ず通す） */
  U.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.uid = function (prefix) {
    const r = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    return (prefix || 'id') + '_' + r;
  };

  // ---------- 日付（すべてローカル時刻の文字列で扱う） ----------
  /** Date -> 'YYYY-MM-DD' */
  U.dateStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  /** Date -> 'YYYY-MM-DDTHH:mm' */
  U.dtStr = (d) => U.dateStr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  U.today = () => U.dateStr(new Date());
  U.now = () => U.dtStr(new Date());

  /** 'YYYY-MM-DD' -> Date（正午固定で日付計算の誤差を防ぐ） */
  U.parseDate = function (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  };
  U.addDays = function (s, n) {
    const d = U.parseDate(s);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return U.dateStr(d);
  };
  /** b - a の日数 */
  U.diffDays = function (a, b) {
    const da = U.parseDate(a), db = U.parseDate(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  };

  /** '2026-11-05' -> '11/05(木)' */
  U.fmtDate = function (s, withYear) {
    const d = U.parseDate(s);
    if (!d) return '';
    const head = withYear ? d.getFullYear() + '/' : '';
    return head + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '(' + WEEK[d.getDay()] + ')';
  };
  /** '2026-11-05T17:30' -> '11/05(木) 17:30' */
  U.fmtDT = function (s, withYear) {
    if (!s) return '';
    const t = /T(\d{2}:\d{2})/.exec(s);
    return U.fmtDate(s, withYear) + (t ? ' ' + t[1] : '');
  };
  /** 保存形式 -> CSV用 'YYYY-MM-DD HH:mm' */
  U.dtToCsv = (s) => (s ? s.replace('T', ' ') : '');

  /** CSV等の自由形式を 'YYYY-MM-DD' に（Excelの 2026/11/5 形式にも対応） */
  U.normalizeDate = function (s) {
    s = String(s || '').trim();
    if (!s) return '';
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    if (!m) return null;
    return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  };
  /** CSV等の自由形式を 'YYYY-MM-DDTHH:mm' に。時刻が無ければ 00:00 */
  U.normalizeDateTime = function (s) {
    s = String(s || '').trim();
    if (!s) return '';
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) + 'T' + pad(m[4] || 0) + ':' + (m[5] || '00');
  };

  // ---------- MAWB番号（3桁航空会社コード-8桁、末尾はチェックデジット） ----------
  U.checkMawbNo = function (no) {
    const m = /^(\d{3})-?(\d{7})(\d)$/.exec(String(no || '').trim());
    if (!m) return { formatOk: false, checkOk: false };
    return { formatOk: true, checkOk: (+m[2] % 7) === +m[3], normalized: m[1] + '-' + m[2] + m[3] };
  };
  /** 3桁コード + 7桁連番からチェックデジット付きMAWB番号を作る（ダミーデータ用） */
  U.makeMawbNo = (prefix, serial7) => prefix + '-' + serial7 + (+serial7 % 7);

  U.num = function (v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  };
  U.fmtNum = (n, digits) => (n === null || n === undefined || n === '') ? '-' :
    Number(n).toLocaleString('ja-JP', { maximumFractionDigits: digits === undefined ? 1 : digits });

  // ---------- トースト ----------
  U.toast = function (msg, type) {
    let box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('hide'), 2600);
    setTimeout(() => el.remove(), 3000);
  };

  // ---------- モーダル ----------
  /**
   * モーダルを開く。{ title, body(html), footer(html), wide } を受け取り、
   * { el, close } を返す。Escキー・背景クリックで閉じる。
   */
  U.openModal = function (opt) {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal' + (opt.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + U.esc(opt.title) + '">' +
        '<div class="modal-head"><h2>' + U.esc(opt.title) + '</h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="閉じる">✕</button></div>' +
        '<div class="modal-body">' + (opt.body || '') + '</div>' +
        (opt.footer ? '<div class="modal-foot">' + opt.footer + '</div>' : '') +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');

    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (opt.onClose) opt.onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && wrap === [...document.querySelectorAll('.modal-backdrop')].pop()) close();
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

    const first = wrap.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
    setTimeout(() => (first || wrap.querySelector('.modal')).focus(), 0);
    return { el: wrap, close };
  };

  /** 確認ダイアログ。Promise<boolean> */
  U.confirm = function (message, opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      let answered = false;
      const m = U.openModal({
        title: opt.title || '確認',
        body: '<p class="confirm-msg">' + U.esc(message).replace(/\n/g, '<br>') + '</p>',
        footer:
          '<button type="button" class="btn" data-close>キャンセル</button>' +
          '<button type="button" class="btn ' + (opt.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + U.esc(opt.okLabel || 'OK') + '</button>',
        onClose: () => { if (!answered) resolve(false); },
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
      setTimeout(() => m.el.querySelector('[data-ok]').focus(), 0);
    });
  };

  /** フォームの値をオブジェクトで取得（チェックボックスは true/false） */
  U.formData = function (form) {
    const o = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim();
    });
    return o;
  };

  U.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };

  App.util = U;
})(window.App);

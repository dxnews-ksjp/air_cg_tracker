/**
 * 進捗管理タブ：MAWB / HAWB のツリー一覧
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;
  const UI = App.ui;
  const esc = U.esc;

  const state = {
    filter: { dir: '', status: '', assignee: '', special: '', alert: '', q: '' },
    sort: 'etd',
    collapsed: new Set(),
    filtersOpen: false, // スマホ表示時の絞り込み欄の開閉
  };
  const DEFAULT_FILTER = { dir: '', status: '', assignee: '', special: '', alert: '', q: '' };

  function hawbMatches(h, m, p, a, f) {
    if (f.status === 'OPEN' && p.complete) return false;
    if (f.status === 'DONE' && !p.complete) return false;
    if (f.status && f.status.indexOf(':') > 0) {
      const [dir, code] = f.status.split(':');
      if (m.direction !== dir) return false;
      const cur = p.currentCode;
      if (cur !== code) return false;
    }
    if (f.assignee && (h.assignee || '') !== (f.assignee === '_none' ? '' : f.assignee)) return false;
    const sp = h.special || {};
    if (f.special === 'any' && !M.hasSpecial(h)) return false;
    if (['dg', 'reefer', 'other'].includes(f.special) && !sp[f.special]) return false;
    if (f.alert === 'overdue' && a.level !== 'overdue') return false;
    if (f.alert === 'soon' && a.level !== 'soon') return false;
    if (f.alert === 'any' && !a.level) return false;
    if (f.alert === 'none' && a.level) return false;
    return true;
  }

  function keywordHit(text, q) {
    return String(text || '').toLowerCase().includes(q);
  }

  function hawbLevelFilterActive(f) {
    return !!(f.status || f.assignee || f.special || f.alert);
  }

  function buildRows(snap, today) {
    const f = state.filter;
    const q = f.q.toLowerCase();
    const byMawb = {};
    snap.hawbs.forEach((h) => { (byMawb[h.mawbId] = byMawb[h.mawbId] || []).push(h); });

    const groups = [];
    snap.mawbs.forEach((m) => {
      if (f.dir && m.direction !== f.dir) return;
      const all = (byMawb[m.id] || []).map((h) => ({
        h, p: M.progress(h, m.direction), a: M.hawbAlert(h, m.direction, today),
      }));
      const mawbHit = q && [m.mawbNo, m.flightNo, m.flight2No, m.airline, m.origin, m.transit, m.destination].some((t) => keywordHit(t, q));
      let shown = all.filter((x) => hawbMatches(x.h, m, x.p, x.a, f));
      if (q && !mawbHit) {
        shown = shown.filter((x) => [x.h.hawbNo, x.h.shipper, x.h.consignee, x.h.commodity, x.h.assignee].some((t) => keywordHit(t, q)));
      }
      if (hawbLevelFilterActive(f) || (q && !mawbHit)) {
        if (!shown.length) return;
      }
      const summary = M.mawbSummary(m, all.map((x) => x.h), today);
      const lastUpd = [m.updatedAt].concat(all.map((x) => x.h.updatedAt)).sort().pop() || '';
      groups.push({ m, all, shown, summary, lastUpd });
    });

    const blankLast = (a, b) => (a ? (b ? a.localeCompare(b) : -1) : (b ? 1 : 0));
    const sorters = {
      etd: (a, b) => blankLast(a.m.etd, b.m.etd),
      eta: (a, b) => blankLast(a.m.eta, b.m.eta),
      mawbNo: (a, b) => a.m.mawbNo.localeCompare(b.m.mawbNo),
      delay: (a, b) => (b.summary.maxOverdueDays - a.summary.maxOverdueDays) || (b.summary.overdueCount - a.summary.overdueCount) ||
        (b.summary.soonCount - a.summary.soonCount) || blankLast(a.m.etd, b.m.etd),
      updated: (a, b) => b.lastUpd.localeCompare(a.lastUpd),
    };
    groups.sort(sorters[state.sort] || sorters.etd);
    groups.forEach((g) => {
      g.shown.sort(state.sort === 'delay'
        ? (x, y) => (y.a.overdueDays - x.a.overdueDays) || x.h.hawbNo.localeCompare(y.h.hawbNo)
        : (x, y) => x.h.hawbNo.localeCompare(y.h.hawbNo));
    });
    return groups;
  }

  function filterBar(snap) {
    const f = state.filter;
    const sel = (name, label, options) =>
      '<label class="filter"><span>' + esc(label) + '</span><select name="' + name + '">' +
      options.map((o) => '<option value="' + esc(o[0]) + '"' + (f[name] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
      '</select></label>';
    const statusOpts = '<option value="">すべて</option>' +
      '<option value="OPEN"' + (f.status === 'OPEN' ? ' selected' : '') + '>未完了のみ</option>' +
      '<option value="DONE"' + (f.status === 'DONE' ? ' selected' : '') + '>完了のみ</option>' +
      ['EXPORT', 'IMPORT'].map((dir) =>
        '<optgroup label="' + M.dirLabel(dir) + '（現在のステータス）">' +
        '<option value="' + dir + ':NONE"' + (f.status === dir + ':NONE' ? ' selected' : '') + '>未着手</option>' +
        M.workflow(dir).map((w) => {
          const v = dir + ':' + w.code;
          return '<option value="' + v + '"' + (f.status === v ? ' selected' : '') + '>' + esc(w.name) + '</option>';
        }).join('') + '</optgroup>').join('');
    const assignees = [...new Set(snap.hawbs.map((h) => h.assignee).filter(Boolean))].sort();
    const isFiltered = Object.keys(DEFAULT_FILTER).some((k) => f[k]);
    return '<button type="button" class="btn filter-toggle" data-act="toggle-filters" aria-expanded="' + state.filtersOpen + '">' +
        '絞り込み・並べ替え' + (isFiltered ? '（条件あり）' : '') + ' ' + (state.filtersOpen ? '▴' : '▾') + '</button>' +
      '<form class="filters' + (state.filtersOpen ? ' show' : '') + '" role="search" onsubmit="return false">' +
      '<label class="filter grow"><span>キーワード</span><input type="search" name="q" value="' + esc(f.q) + '" placeholder="MAWB・HAWB番号、荷主、品名など"></label>' +
      sel('dir', '輸出入', [['', 'すべて'], ['EXPORT', '輸出'], ['IMPORT', '輸入']]) +
      '<label class="filter"><span>ステータス</span><select name="status">' + statusOpts + '</select></label>' +
      sel('assignee', '担当者', [['', 'すべて']].concat(assignees.map((a) => [a, a])).concat([['_none', '（未設定）']])) +
      sel('special', '特殊貨物', [['', 'すべて'], ['any', 'いずれかあり'], ['dg', '危険品'], ['reefer', '保冷品'], ['other', 'その他特殊']]) +
      sel('alert', '遅延', [['', 'すべて'], ['overdue', '遅延あり'], ['soon', '期限間近'], ['any', '遅延または期限間近'], ['none', '問題なし']]) +
      '<label class="filter"><span>並べ替え</span><select name="sort">' +
        [['etd', 'ETDが早い順'], ['eta', 'ETAが早い順'], ['mawbNo', 'MAWB番号順'], ['delay', '遅延が大きい順'], ['updated', '更新が新しい順']]
          .map((o) => '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></label>' +
      (isFiltered ? '<button type="button" class="btn btn-sm btn-link" data-act="reset-filter">条件をクリア</button>' : '') +
      '</form>';
  }

  function mawbRow(g, today) {
    const m = g.m, s = g.summary;
    const open = !state.collapsed.has(m.id);
    const partial = g.shown.length !== g.all.length;
    const alert = s.overdueCount
      ? '<span class="alert-badge overdue" title="遅延しているHAWBの件数と最大遅延日数">⚠ 遅延' + s.overdueCount + '件・最大' + s.maxOverdueDays + '日</span>'
      : ''; // 期限間近の件数はMAWB行には表示しない（HAWB行の警告欄に表示）
    return '<div class="mawb-row' + (s.overdueCount ? ' has-overdue' : '') + '">' +
      '<button type="button" class="toggle" data-act="toggle" data-id="' + m.id + '" aria-expanded="' + open + '" aria-label="配下HAWBを' + (open ? '閉じる' : '開く') + '">' + (open ? '▾' : '▸') + '</button>' +
      '<div class="m-main">' + UI.dirBadge(m.direction) +
        '<a class="mawb-no" href="#/mawb/' + m.id + '">MAWB ' + esc(m.mawbNo) + '</a>' +
        '<span class="flight">' + UI.route(m) + '</span></div>' +
      '<div class="m-flights">' + UI.flights(m) + '</div>' +
      '<div class="m-sched"><span><em>ETD</em>' + (m.etd ? U.fmtDT(m.etd) : '—') + '</span><span><em>ETA</em>' + (m.eta ? U.fmtDT(m.eta) : '—') + '</span></div>' +
      '<div class="m-sum">' +
        (s.count
          ? '<span class="m-slow">' + (s.allDone ? '全件完了' : '最遅：<strong>' + esc(s.slowest) + '</strong>') + '</span>'
          : '<span class="muted">HAWB未登録</span>') +
        (partial ? '<span class="m-partial">（' + g.all.length + '件中' + g.shown.length + '件表示）</span>' : '') +
      '</div>' +
      '<div class="m-flags">' + UI.specialIcons(s.specials) + alert + '</div>' +
      '<div class="m-act"><button type="button" class="btn btn-sm" data-act="add-hawb" data-id="' + m.id + '">＋HAWB</button></div>' +
      '</div>';
  }

  // HAWB行の列見出し（PC表示のみ）
  // HAWB行の列見出し（PC表示のみ）。相手先の列名は輸出入区分で切り替える
  const hawbHead = (dir) => '<div class="hawb-head" aria-hidden="true">' +
    ['HAWB番号', M.partyLabel(dir), '品名', '個数 / 重量', '担当', '特殊貨物']
      .map((t) => '<span>' + t + '</span>').join('') + '</div>';

  function hawbRow(x, m, today) {
    const h = x.h, p = x.p, a = x.a;
    const has = (v) => v !== null && v !== undefined && v !== '';
    const qty = (has(h.pieces) ? U.fmtNum(h.pieces, 0) + 'pcs' : '-') + ' / ' + (has(h.weightKg) ? U.fmtNum(h.weightKg) + 'kg' : '-');
    const lbl = (t) => '<span class="muted-label">' + t + '</span>';
    const party = M.partyName(h, m.direction) || '';
    return '<div class="hawb-row' + (p.complete ? ' is-done' : '') + '" data-href="#/hawb/' + h.id + '">' +
      '<div class="h-no"><a href="#/hawb/' + h.id + '">' + esc(h.hawbNo) + '</a></div>' +
      '<div class="h-party" title="' + esc(party) + '">' + lbl(M.partyLabel(m.direction)) + esc(party) + '</div>' +
      '<div class="h-com" title="' + esc(h.commodity || '') + '">' + lbl('品名') + esc(h.commodity || '—') + '</div>' +
      '<div class="h-qty">' + lbl('個数/重量') + qty + '</div>' +
      '<div class="h-asg">' + lbl('担当') + esc(h.assignee || '—') + '</div>' +
      '<div class="h-sp">' + UI.specialLabels(h) + '</div>' +
      '<div class="h-steps">' + UI.stepStrip(h, m.direction, today) + '</div>' +
      '</div>';
  }

  async function render(container) {
    const el = document.createElement('div');
    const snap = await App.repo.snapshot();
    const today = U.today();
    const groups = buildRows(snap, today);
    const hawbCount = groups.reduce((n, g) => n + g.shown.length, 0);

    el.innerHTML =
      '<div class="page-head">' +
        '<h1>進捗管理</h1>' +
        '<div class="actions">' +
          '<button type="button" class="btn btn-primary" data-act="new-mawb">＋ MAWB登録</button>' +
          '<button type="button" class="btn btn-primary" data-act="new-hawb">＋ HAWB登録</button>' +
          '<a class="btn" href="#/data">CSV・データ管理</a>' +
        '</div>' +
      '</div>' +
      filterBar(snap) +
      '<div class="list-tools"><span class="count">MAWB ' + groups.length + '件 / HAWB ' + hawbCount + '件</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-sm" data-act="expand-all">すべて開く</button>' +
        '<button type="button" class="btn btn-sm" data-act="collapse-all">すべて閉じる</button></div>' +
      '<div class="tree">' +
        (groups.length ? groups.map((g) => {
          const open = !state.collapsed.has(g.m.id);
          return '<section class="mawb-group' + (open ? ' open' : '') + '">' + mawbRow(g, today) +
            (open ? '<div class="hawb-list">' +
              (g.shown.length ? hawbHead(g.m.direction) + g.shown.map((x) => hawbRow(x, g.m, today)).join('') : '<div class="hawb-empty">HAWBはまだありません。「＋HAWB」から登録できます。</div>') +
              '</div>' : '') +
            '</section>';
        }).join('') : UI.empty('条件に合う案件はありません。')) +
      '</div>';

    container.replaceChildren(el);

    // ---- イベント ----
    const form = el.querySelector('.filters');
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'sort') state.sort = t.value;
      else if (t.name && t.name !== 'q') state.filter[t.name] = t.value;
      render(container);
    });
    const qInput = form.querySelector('[name="q"]');
    let timer = null;
    qInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        state.filter.q = qInput.value.trim();
        const pos = qInput.selectionStart;
        await render(container);
        const ni = container.querySelector('.filters [name="q"]');
        ni.focus();
        try { ni.setSelectionRange(pos, pos); } catch (e) { /* noop */ }
      }, 250);
    });

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const act = b.dataset.act;
        if (act === 'toggle') {
          state.collapsed.has(b.dataset.id) ? state.collapsed.delete(b.dataset.id) : state.collapsed.add(b.dataset.id);
          render(container);
        } else if (act === 'expand-all') { state.collapsed.clear(); render(container); }
        else if (act === 'collapse-all') { snap.mawbs.forEach((m) => state.collapsed.add(m.id)); render(container); }
        else if (act === 'toggle-filters') { state.filtersOpen = !state.filtersOpen; render(container); }
        else if (act === 'reset-filter') { state.filter = Object.assign({}, DEFAULT_FILTER); render(container); }
        else if (act === 'new-mawb') App.forms.mawb({ onSaved: () => App.refresh() });
        else if (act === 'new-hawb') App.forms.hawb({ onSaved: () => App.refresh() });
        else if (act === 'add-hawb') {
          state.collapsed.delete(b.dataset.id);
          App.forms.hawb({ mawbId: b.dataset.id, onSaved: () => App.refresh() });
        }
        return;
      }
      const row = e.target.closest('.hawb-row[data-href]');
      if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
    });
  }

  App.views.progress = { render, state };
})(window.App);

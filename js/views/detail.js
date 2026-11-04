/**
 * 詳細画面（HAWB詳細 / MAWB詳細）
 */
(function (App) {
  'use strict';
  const U = App.util;
  const M = App.model;
  const UI = App.ui;
  const esc = U.esc;

  const dl = (rows) => '<dl class="info">' + rows.map((r) =>
    '<div><dt>' + esc(r[0]) + '</dt><dd>' + (r[2] ? r[1] : esc(r[1] === null || r[1] === undefined || r[1] === '' ? '—' : r[1])) + '</dd></div>').join('') + '</dl>';

  function notFound(container, what) {
    container.innerHTML = '<div class="page-head"><h1>' + esc(what) + 'が見つかりません</h1></div>' +
      '<p>削除された可能性があります。<a href="#/progress">進捗管理の一覧に戻る</a></p>';
  }

  function flightInfo(m) {
    return dl([
      ['MAWB番号', '<a href="#/mawb/' + m.id + '">' + esc(m.mawbNo) + '</a>', true],
      ['輸出入区分', UI.dirBadge(m.direction), true],
      ['航空会社 / 便名', (m.airline || '—') + ' / ' + (m.flightNo || '—')],
      ['区間', (m.origin || '???') + ' → ' + (m.destination || '???')],
      ['ETD', m.etd ? U.fmtDT(m.etd, true) : ''],
      ['ETA', m.eta ? U.fmtDT(m.eta, true) : ''],
    ]);
  }

  // ======================= HAWB詳細 =======================
  async function renderHawb(container, id) {
    const h = await App.repo.getHawb(id);
    if (!h) return notFound(container, 'HAWB');
    const m = await App.repo.getMawb(h.mawbId);
    if (!m) return notFound(container, '親MAWB');
    const tasks = (await App.repo.listManualTasks()).filter((t) => t.hawbId === h.id).sort((a, b) => a.date.localeCompare(b.date));
    const today = U.today();
    const wf = M.workflow(m.direction);
    const p = M.progress(h, m.direction);
    const a = M.hawbAlert(h, m.direction, today);
    const el = document.createElement('div');

    const blockStart = {};
    M.blocks(m.direction).forEach((g) => { if (g.label) blockStart[g.items[0].i] = g.label; });
    const timeline = wf.map((w, i) => {
      const s = h.steps[i] || {};
      const st = M.stepState(s, today);
      const isNext = p.next && p.next.idx === i;
      let lateNote = '';
      if (st === 'overdue') lateNote = '<span class="late">' + U.diffDays(s.plannedDate, today) + '日超過</span>';
      if (st === 'done' && s.plannedDate && s.actualAt.slice(0, 10) > s.plannedDate) {
        lateNote = '<span class="late-done">予定より' + U.diffDays(s.plannedDate, s.actualAt.slice(0, 10)) + '日遅れで完了</span>';
      }
      return (blockStart[i] ? '<li class="tl-block">' + esc(blockStart[i]) + '</li>' : '') +
        '<li class="tl-item tl-' + st + (isNext ? ' is-next' : '') + '">' +
        '<span class="tl-dot" aria-hidden="true">' + (st === 'done' ? '✓' : i + 1) + '</span>' +
        '<div class="tl-body">' +
          '<div class="tl-title"><strong>' + esc(w.name) + '</strong>' + UI.stateBadge(st) + (isNext ? '<span class="next-tag">次の工程</span>' : '') + '</div>' +
          '<div class="tl-dates"><span><em>予定</em>' + (s.plannedDate ? U.fmtDate(s.plannedDate) : '—') + '</span>' +
          '<span><em>実績</em>' + (s.actualAt ? U.fmtDT(s.actualAt) : '—') + '</span>' + lateNote + '</div>' +
        '</div></li>';
    }).join('');

    const taskList = tasks.length ? '<ul class="mini-tasks">' + tasks.map((t) =>
      '<li class="' + (t.done ? 'is-done' : (t.date < today ? 'is-overdue' : '')) + '">' +
        '<label class="check"><input type="checkbox" data-task-done="' + t.id + '"' + (t.done ? ' checked' : '') + '> ' +
        '<span class="mt-date">' + U.fmtDate(t.date) + '</span><span class="mt-text">' + esc(t.content) + '</span></label>' +
        '<button type="button" class="btn btn-sm btn-link" data-task-edit="' + t.id + '">編集</button></li>').join('') + '</ul>'
      : '<p class="muted">手入力タスクはありません。</p>';

    el.innerHTML =
      '<nav class="crumbs" aria-label="パンくず"><a href="#/progress">進捗管理</a><span>›</span>' +
        '<a href="#/mawb/' + m.id + '">MAWB ' + esc(m.mawbNo) + '</a><span>›</span><span>HAWB ' + esc(h.hawbNo) + '</span></nav>' +
      '<div class="page-head">' +
        '<h1>' + UI.dirBadge(m.direction) + ' HAWB ' + esc(h.hawbNo) + '</h1>' +
        '<div class="actions"><button type="button" class="btn" data-act="edit">編集</button>' +
        '<button type="button" class="btn btn-danger-outline" data-act="delete">削除</button></div>' +
      '</div>' +
      '<div class="head-flags">' + UI.specialLabels(h, true) + UI.alertBadge(a) + '</div>' +

      '<div class="detail-grid">' +
        '<div class="col-main">' +
          '<section class="card advance-card">' +
            '<div class="adv-status"><span class="muted-label">現在のステータス</span>' + UI.statusText(p) +
              UI.progressBar(p) + '<span class="muted">' + p.done + '/' + p.total + '工程</span></div>' +
            (p.next
              ? '<button type="button" class="btn btn-advance" data-act="advance">▶ 「' + esc(p.next.name) + '」を完了にする</button>' +
                '<p class="field-hint">押した時刻が実績日時として記録されます。' +
                  (p.next.plannedDate ? '（予定日：' + U.fmtDate(p.next.plannedDate) + '）' : '') + '</p>'
              : '<p class="all-done">✓ すべての工程が完了しています</p>') +
            (p.done ? '<button type="button" class="btn btn-sm btn-link" data-act="revert">↶ 1つ戻す（「' + esc(wf[p.done - 1].name) + '」の実績を取り消し）</button>' : '') +
          '</section>' +
          '<section class="card"><h2>工程</h2><ol class="timeline">' + timeline + '</ol></section>' +
        '</div>' +
        '<div class="col-side">' +
          '<section class="card"><h2>便情報（MAWB）</h2>' + flightInfo(m) + '</section>' +
          '<section class="card"><h2>貨物情報</h2>' + dl([
            ['荷主（輸出者）', h.shipper], ['荷受人（輸入者）', h.consignee], ['品名', h.commodity],
            ['個数', h.pieces === null || h.pieces === undefined ? '' : U.fmtNum(h.pieces, 0) + ' pcs'],
            ['重量', h.weightKg === null || h.weightKg === undefined ? '' : U.fmtNum(h.weightKg) + ' kg'],
            ['容積重量', h.volumeWeightKg === null || h.volumeWeightKg === undefined ? '' : U.fmtNum(h.volumeWeightKg) + ' kg'],
            ['担当者', h.assignee],
          ]) + '</section>' +
          '<section class="card"><h2>特殊貨物</h2>' + (M.hasSpecial(h) ? '<div class="sp-full">' + UI.specialLabels(h, true) + '</div>' : '<p class="muted">なし</p>') + '</section>' +
          '<section class="card"><h2>メモ</h2><textarea class="memo" rows="4" aria-label="メモ">' + esc(h.memo || '') + '</textarea>' +
            '<div class="right"><button type="button" class="btn btn-sm" data-act="save-memo">メモを保存</button></div></section>' +
          '<section class="card"><h2>手入力タスク</h2>' + taskList +
            '<div class="right"><button type="button" class="btn btn-sm" data-act="add-task">＋ タスク追加</button></div></section>' +
        '</div>' +
      '</div>';
    container.replaceChildren(el);

    const reload = () => renderHawb(container, id);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act],[data-task-edit]');
      if (!b) return;
      if (b.dataset.taskEdit) {
        const t = tasks.find((x) => x.id === b.dataset.taskEdit);
        return App.forms.manualTask({ task: t, onSaved: () => App.refresh() });
      }
      const act = b.dataset.act;
      if (act === 'advance') {
        const fresh = await App.repo.getHawb(id);
        const name = M.advance(fresh, m.direction, U.now());
        if (!name) return;
        await App.repo.saveHawb(fresh);
        U.toast('「' + name + '」を完了にしました（' + U.fmtDT(U.now()) + '）', 'ok');
        App.refresh();
      } else if (act === 'revert') {
        const fresh = await App.repo.getHawb(id);
        const name = M.workflow(m.direction)[M.progress(fresh, m.direction).done - 1].name;
        if (!(await U.confirm('「' + name + '」の実績日時を取り消して、1つ前の状態に戻しますか？', { okLabel: '戻す' }))) return;
        M.revert(fresh, m.direction);
        await App.repo.saveHawb(fresh);
        U.toast('「' + name + '」を未完了に戻しました', 'ok');
        App.refresh();
      } else if (act === 'edit') {
        App.forms.hawb({ hawb: h, onSaved: () => App.refresh() });
      } else if (act === 'delete') {
        if (!(await U.confirm('HAWB ' + h.hawbNo + ' を削除しますか？\n紐づく手入力タスクも削除されます。この操作は元に戻せません。', { okLabel: '削除', danger: true }))) return;
        await App.repo.deleteHawb(h.id);
        U.toast('HAWBを削除しました', 'ok');
        location.hash = '#/mawb/' + m.id;
      } else if (act === 'save-memo') {
        const fresh = await App.repo.getHawb(id);
        fresh.memo = el.querySelector('.memo').value;
        await App.repo.saveHawb(fresh);
        U.toast('メモを保存しました', 'ok');
        reload();
      } else if (act === 'add-task') {
        App.forms.manualTask({ hawbId: h.id, onSaved: () => App.refresh() });
      }
    });
    el.addEventListener('change', async (e) => {
      const cb = e.target.closest('[data-task-done]');
      if (!cb) return;
      const t = tasks.find((x) => x.id === cb.dataset.taskDone);
      await App.repo.saveManualTask(Object.assign({}, t, { done: cb.checked }));
      App.refresh();
    });
  }

  // ======================= MAWB詳細 =======================
  async function renderMawb(container, id) {
    const m = await App.repo.getMawb(id);
    if (!m) return notFound(container, 'MAWB');
    const hawbs = (await App.repo.listHawbs(id)).sort((a, b) => a.hawbNo.localeCompare(b.hawbNo));
    const today = U.today();
    const s = M.mawbSummary(m, hawbs, today);
    const el = document.createElement('div');

    const rows = hawbs.map((h) => {
      const p = M.progress(h, m.direction);
      const a = M.hawbAlert(h, m.direction, today);
      return '<tr class="' + (p.complete ? 'is-done' : '') + '" data-href="#/hawb/' + h.id + '">' +
        '<td data-label="HAWB番号"><a href="#/hawb/' + h.id + '">' + esc(h.hawbNo) + '</a></td>' +
        '<td data-label="' + M.partyLabel(m.direction) + '">' + esc(M.partyName(h, m.direction)) + '</td>' +
        '<td data-label="品名">' + esc(h.commodity || '') + '</td>' +
        '<td data-label="担当">' + esc(h.assignee || '—') + '</td>' +
        '<td data-label="特殊貨物">' + UI.specialLabels(h) + '</td>' +
        '<td data-label="ステータス">' + UI.statusText(p) + ' ' + UI.progressBar(p) + '</td>' +
        '<td data-label="警告">' + UI.alertBadge(a) + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<nav class="crumbs" aria-label="パンくず"><a href="#/progress">進捗管理</a><span>›</span><span>MAWB ' + esc(m.mawbNo) + '</span></nav>' +
      '<div class="page-head">' +
        '<h1>' + UI.dirBadge(m.direction) + ' MAWB ' + esc(m.mawbNo) + '</h1>' +
        '<div class="actions"><button type="button" class="btn btn-primary" data-act="add-hawb">＋ HAWB追加</button>' +
        '<button type="button" class="btn" data-act="edit">編集</button>' +
        '<button type="button" class="btn btn-danger-outline" data-act="delete">削除</button></div>' +
      '</div>' +
      '<div class="detail-grid mawb">' +
        '<section class="card"><h2>便情報</h2>' + flightInfo(m) + '</section>' +
        '<section class="card"><h2>進捗サマリー</h2>' + dl([
          ['HAWB件数', s.count + '件'],
          ['完了', s.doneCount + ' / ' + s.count + '件'],
          ['最も遅れている工程', s.count ? (s.allDone ? '全件完了' : s.slowest) : ''],
          ['遅延', s.overdueCount ? '<span class="alert-badge overdue">⚠ ' + s.overdueCount + '件（最大' + s.maxOverdueDays + '日）</span>' : 'なし', true],
          ['期限間近', s.soonCount ? '<span class="alert-badge soon">⏰ ' + s.soonCount + '件</span>' : 'なし', true],
          ['特殊貨物', UI.specialIcons(s.specials) || 'なし', true],
        ]) + '</section>' +
      '</div>' +
      '<section class="card"><h2>配下のHAWB</h2>' +
        (hawbs.length
          ? '<div class="table-scroll"><table class="data-table rwd"><thead><tr><th>HAWB番号</th><th>' + M.partyLabel(m.direction) + '</th><th>品名</th><th>担当</th><th>特殊貨物</th><th>ステータス</th><th>警告</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : UI.empty('HAWBはまだありません。「＋HAWB追加」から登録できます。')) +
      '</section>';
    container.replaceChildren(el);

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) {
        const tr = e.target.closest('tr[data-href]');
        if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href;
        return;
      }
      const act = b.dataset.act;
      if (act === 'add-hawb') App.forms.hawb({ mawbId: m.id, onSaved: () => App.refresh() });
      else if (act === 'edit') App.forms.mawb({ mawb: m, onSaved: () => App.refresh() });
      else if (act === 'delete') {
        const msg = 'MAWB ' + m.mawbNo + ' を削除しますか？' + (hawbs.length ? '\n配下のHAWB ' + hawbs.length + '件と、紐づくタスクもまとめて削除されます。' : '') + '\nこの操作は元に戻せません。';
        if (!(await U.confirm(msg, { okLabel: '削除', danger: true }))) return;
        await App.repo.deleteMawb(m.id);
        U.toast('MAWBを削除しました', 'ok');
        location.hash = '#/progress';
      }
    });
  }

  App.views.hawb = { render: renderHawb };
  App.views.mawb = { render: renderMawb };
})(window.App);

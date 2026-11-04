/**
 * タスク管理タブ：期限切れ・今日・明日のタスク一覧
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;
  const UI = App.ui;
  const esc = U.esc;

  const state = { assignee: '', hideDone: false };

  /** タブのバッジ用件数（未完了のみ） */
  async function counts() {
    const snap = await App.repo.snapshot();
    const t = M.buildTasks(snap, U.today());
    const open = (list) => list.filter((x) => !x.done).length;
    return { overdue: t.overdue.length, today: open(t.today), tomorrow: open(t.tomorrow) };
  }

  function filterList(list) {
    return list.filter((t) => {
      if (state.hideDone && t.done) return false;
      if (state.assignee) {
        const a = (t.hawb && t.hawb.assignee) || '';
        if (state.assignee === '_none' ? a : a !== state.assignee) return false;
      }
      return true;
    });
  }

  function taskRow(t) {
    const h = t.hawb || {}, m = t.mawb || {};
    const kindTag = t.kind === 'MANUAL' ? '<span class="kind-tag manual">手入力</span>' : '<span class="kind-tag step">工程</span>';
    const sp = t.hawb ? UI.specialLabels(t.hawb) : '';
    let action = '';
    if (t.kind === 'STEP') {
      if (t.done) action = '<span class="done-tag">✓ 済</span>';
      else if (t.canComplete) action = '<button type="button" class="btn btn-sm btn-primary" data-complete="' + esc(t.key) + '">完了</button>';
      else action = '<span class="muted small" title="前の工程が未完了のため、まだ完了にできません">前工程待ち</span>';
    } else {
      action = '<button type="button" class="btn btn-sm ' + (t.done ? '' : 'btn-primary') + '" data-manual-toggle="' + esc(t.manual.id) + '">' + (t.done ? '未完了に戻す' : '完了') + '</button>' +
        '<button type="button" class="btn btn-sm btn-link" data-manual-edit="' + esc(t.manual.id) + '">編集</button>';
    }
    return '<tr class="' + (t.done ? 'is-done' : '') + ' mark-row-' + (t.color || 'none').toLowerCase() + '" data-href="' + (h.id ? '#/hawb/' + h.id : '') + '">' +
      '<td class="c-mark" data-label="色">' + UI.markDot(t.color, 'data-mark="' + esc(t.key) + '"') + '</td>' +
      '<td data-label="HAWB">' + (m.id ? UI.dirBadge(m.direction) + ' ' : '') + (h.id ? '<a href="#/hawb/' + h.id + '">' + esc(h.hawbNo) + '</a>' : '—') + '</td>' +
      '<td data-label="' + (m.id ? M.partyLabel(m.direction) : '輸出者／輸入者') + '">' + (m.id ? esc(M.partyName(h, m.direction) || '') : '') + '</td>' +
      '<td data-label="内容" class="c-content">' + kindTag + '<span class="task-text">' + esc(t.content) + '</span>' +
        (t.overdueDays ? '<span class="late">' + U.fmtDate(t.date) + ' 予定・' + t.overdueDays + '日超過</span>' : '') + sp +
        (h.assignee ? '<span class="asg">担当：' + esc(h.assignee) + '</span>' : '') + '</td>' +
      '<td class="c-act" data-label="操作">' + action + '</td>' +
      '</tr>';
  }

  function section(key, title, list, opt) {
    const shown = filterList(list);
    const openCount = shown.filter((t) => !t.done).length;
    return '<section class="task-sec sec-' + key + '">' +
      '<div class="task-sec-head"><h2>' + title + '</h2><span class="count">' + openCount + '件' +
        (shown.length !== openCount ? '（完了 ' + (shown.length - openCount) + '件）' : '') + '</span>' +
        (opt.date ? '<button type="button" class="btn btn-sm" data-add-task="' + opt.date + '">＋ タスク追加</button>' : '') +
      '</div>' +
      (shown.length
        ? '<div class="table-scroll"><table class="data-table rwd task-table"><thead><tr>' +
            '<th class="c-mark">色</th><th>HAWB</th><th>輸出者／輸入者</th><th>タスク内容</th><th class="c-act">操作</th>' +
          '</tr></thead><tbody>' + shown.map(taskRow).join('') + '</tbody></table></div>'
        : UI.empty(opt.emptyMsg)) +
      '</section>';
  }

  async function render(container) {
    const snap = await App.repo.snapshot();
    const today = U.today();
    const tomorrow = U.addDays(today, 1);
    const tasks = M.buildTasks(snap, today);
    const assignees = [...new Set(snap.hawbs.map((h) => h.assignee).filter(Boolean))].sort();
    const all = tasks.overdue.concat(tasks.today, tasks.tomorrow);
    const el = document.createElement('div');

    el.innerHTML =
      '<div class="page-head"><h1>タスク管理</h1>' +
        '<div class="actions"><button type="button" class="btn btn-primary" data-add-task="' + today + '">＋ タスク追加</button></div></div>' +
      '<div class="filters task-filters">' +
        '<label class="filter"><span>担当者</span><select name="assignee">' +
          [['', '全員']].concat(assignees.map((a) => [a, a])).concat([['_none', '（未設定）']])
            .map((o) => '<option value="' + esc(o[0]) + '"' + (state.assignee === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
        '</select></label>' +
        '<label class="check"><input type="checkbox" name="hideDone"' + (state.hideDone ? ' checked' : '') + '> 完了を隠す</label>' +
        '<span class="spacer"></span>' +
        '<span class="legend">自分チェック：' + cfg.MARK_COLORS.map((c) =>
          '<span class="lg-mark"><span class="mark-dot static mark-' + (c.code || 'none').toLowerCase() + '"></span>' + esc(c.label) + '</span>').join('') +
        '</span>' +
      '</div>' +
      (tasks.overdue.length || !state.hideDone
        ? section('overdue', '⚠ 期限切れ（予定日を過ぎて未完了）', tasks.overdue, { emptyMsg: '期限切れのタスクはありません。' })
        : '') +
      section('today', '今日 ' + U.fmtDate(today), tasks.today, { date: today, emptyMsg: '今日のタスクはありません。' }) +
      section('tomorrow', '明日 ' + U.fmtDate(tomorrow), tasks.tomorrow, { date: tomorrow, emptyMsg: '明日のタスクはありません。' }) +
      '<p class="field-hint">工程タスクは、進捗管理で入力した各工程の予定日から自動で表示されます。行をクリックするとHAWB詳細を開きます。</p>';
    container.replaceChildren(el);

    el.querySelector('[name="assignee"]').addEventListener('change', (e) => { state.assignee = e.target.value; render(container); });
    el.querySelector('[name="hideDone"]').addEventListener('change', (e) => { state.hideDone = e.target.checked; render(container); });

    el.addEventListener('click', async (e) => {
      const mark = e.target.closest('[data-mark]');
      if (mark) {
        const t = all.find((x) => x.key === mark.dataset.mark);
        await App.repo.setTaskMark(t.key, M.nextMarkColor(t.color));
        return render(container);
      }
      const comp = e.target.closest('[data-complete]');
      if (comp) {
        const t = all.find((x) => x.key === comp.dataset.complete);
        const h = await App.repo.getHawb(t.hawb.id);
        const p = M.progress(h, t.mawb.direction);
        if (!p.next || p.next.code !== t.stepCode) { U.toast('前の工程が未完了のため完了にできません', 'warn'); return; }
        const name = M.advance(h, t.mawb.direction, U.now());
        await App.repo.saveHawb(h);
        U.toast(h.hawbNo + '「' + name + '」を完了にしました', 'ok');
        return App.refresh();
      }
      const mt = e.target.closest('[data-manual-toggle]');
      if (mt) {
        const t = snap.manualTasks.find((x) => x.id === mt.dataset.manualToggle);
        await App.repo.saveManualTask(Object.assign({}, t, { done: !t.done }));
        U.toast(t.done ? 'タスクを未完了に戻しました' : 'タスクを完了にしました', 'ok');
        return App.refresh();
      }
      const me = e.target.closest('[data-manual-edit]');
      if (me) {
        const t = snap.manualTasks.find((x) => x.id === me.dataset.manualEdit);
        return App.forms.manualTask({ task: t, onSaved: () => App.refresh() });
      }
      const add = e.target.closest('[data-add-task]');
      if (add) return App.forms.manualTask({ date: add.dataset.addTask, onSaved: () => App.refresh() });
      const tr = e.target.closest('tr[data-href]');
      if (tr && tr.dataset.href && !e.target.closest('a,button,input')) location.hash = tr.dataset.href;
    });
  }

  App.views.tasks = { render, counts, state };
})(window.App);

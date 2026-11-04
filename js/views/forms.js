/**
 * 登録・編集フォーム（MAWB / HAWB / 手入力タスク）
 * すべてモーダルで開きます。
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;
  const esc = U.esc;

  const F = {};

  function showErrors(form, errors) {
    const box = form.querySelector('.form-errors');
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    if (!errors.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<strong>入力内容を確認してください</strong><ul>' +
      errors.map((e) => '<li>' + esc(e.msg) + '</li>').join('') + '</ul>';
    errors.forEach((e) => {
      if (!e.name) return;
      const el = form.querySelector('[name="' + e.name + '"]');
      if (el) el.classList.add('invalid');
    });
    const first = errors.find((e) => e.name);
    const el = first && form.querySelector('[name="' + first.name + '"]');
    if (el) el.focus();
    box.scrollIntoView({ block: 'nearest' });
  }

  const field = (label, html, opt) => {
    opt = opt || {};
    return '<label class="field' + (opt.cls ? ' ' + opt.cls : '') + '"><span class="field-label">' + esc(label) +
      (opt.required ? '<em class="req">必須</em>' : '') + '</span>' + html +
      (opt.hint ? '<span class="field-hint">' + esc(opt.hint) + '</span>' : '') + '</label>';
  };
  const input = (name, value, attrs) =>
    '<input name="' + name + '" value="' + esc(value === null || value === undefined ? '' : value) + '" ' + (attrs || '') + '>';

  // ======================= MAWB =======================
  F.mawb = async function (opt) {
    opt = opt || {};
    const isEdit = !!opt.mawb;
    const m = opt.mawb || { direction: 'EXPORT' };
    const body =
      '<form class="form" novalidate>' +
      '<div class="form-errors" hidden></div>' +
      '<div class="field"><span class="field-label">輸出入区分<em class="req">必須</em></span>' +
        '<div class="seg">' +
          Object.keys(cfg.DIRECTIONS).map((d) =>
            '<label><input type="radio" name="direction" value="' + d + '"' + (m.direction === d ? ' checked' : '') + '><span>' + esc(M.dirLabel(d)) + '</span></label>').join('') +
        '</div>' +
        (isEdit ? '<span class="field-hint">区分を変えると配下HAWBの工程も切り替わります（請求・完了以外の実績は消えます）</span>' : '') +
      '</div>' +
      '<div class="grid-2">' +
        field('MAWB番号', input('mawbNo', m.mawbNo, 'placeholder="131-12345675" inputmode="numeric" autocomplete="off"'), { required: true, hint: '航空会社コード3桁-8桁' }) +
        '<div class="grid-2 tight">' +
          field('航空会社', input('airline', m.airline, 'placeholder="JL" maxlength="3" class="upper"')) +
          field('便名', input('flightNo', m.flightNo, 'placeholder="JL062" maxlength="8" class="upper"')) +
        '</div>' +
        field('出発地（IATA）', input('origin', m.origin, 'placeholder="NRT" maxlength="3" class="upper"'), { required: true }) +
        field('到着地（IATA）', input('destination', m.destination, 'placeholder="LAX" maxlength="3" class="upper"'), { required: true }) +
        field('ETD（出発予定・現地時刻）', input('etd', m.etd, 'type="datetime-local"')) +
        field('ETA（到着予定・現地時刻）', input('eta', m.eta, 'type="datetime-local"')) +
      '</div>' +
      '</form>';
    const modal = U.openModal({
      title: isEdit ? 'MAWBを編集' : 'MAWBを登録',
      body,
      footer: '<button type="button" class="btn" data-close>キャンセル</button><button type="button" class="btn btn-primary" data-save>保存</button>',
    });
    const form = modal.el.querySelector('form');
    form.querySelectorAll('.upper').forEach((el) => el.addEventListener('input', () => { el.value = el.value.toUpperCase(); }));

    const save = async () => {
      const v = U.formData(form);
      const errors = [];
      const chk = U.checkMawbNo(v.mawbNo);
      if (!v.mawbNo) errors.push({ name: 'mawbNo', msg: 'MAWB番号を入力してください' });
      else if (!chk.formatOk) errors.push({ name: 'mawbNo', msg: 'MAWB番号は「3桁-8桁」の数字で入力してください（例：131-12345675）' });
      if (v.airline && !/^[A-Z0-9]{2,3}$/.test(v.airline)) errors.push({ name: 'airline', msg: '航空会社は2〜3文字のコードで入力してください（例：JL）' });
      ['origin', 'destination'].forEach((k) => {
        if (!/^[A-Z]{3}$/.test(v[k])) errors.push({ name: k, msg: (k === 'origin' ? '出発地' : '到着地') + 'はIATA空港コード（英字3文字）で入力してください' });
      });
      if (v.origin && v.origin === v.destination) errors.push({ name: 'destination', msg: '出発地と到着地が同じです' });
      showErrors(form, errors);
      if (errors.length) return;
      if (!chk.checkOk) {
        const ok = await U.confirm('MAWB番号 ' + chk.normalized + ' のチェックデジット（末尾1桁）が一致しません。\nこのまま保存しますか？', { okLabel: '保存する' });
        if (!ok) return;
      }
      if (isEdit && opt.mawb.direction !== v.direction) {
        const ok = await U.confirm('輸出入区分を変更すると、配下HAWBの工程が切り替わり、共通工程（請求・完了）以外の予定日・実績は消えます。\nよろしいですか？', { okLabel: '変更する', danger: true });
        if (!ok) return;
      }
      const data = Object.assign({}, m, {
        mawbNo: chk.normalized, direction: v.direction, airline: v.airline, flightNo: v.flightNo,
        origin: v.origin, destination: v.destination, etd: v.etd, eta: v.eta,
      });
      try {
        const saved = await App.repo.saveMawb(data);
        modal.close();
        U.toast(isEdit ? 'MAWBを更新しました' : 'MAWBを登録しました', 'ok');
        if (opt.onSaved) opt.onSaved(saved);
      } catch (e) {
        showErrors(form, [{ name: 'mawbNo', msg: e.message }]);
      }
    };
    modal.el.querySelector('[data-save]').addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  };

  // ======================= HAWB =======================
  function stepRows(dir, steps) {
    const map = {};
    (steps || []).forEach((s) => { map[s.code] = s; });
    return M.workflow(dir).map((w, i) => {
      const s = map[w.code] || {};
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td><th scope="row">' + esc(w.name) + '</th>' +
        '<td><input type="date" name="pl_' + w.code + '" value="' + esc(s.plannedDate || '') + '" aria-label="' + esc(w.name) + ' 予定日"></td>' +
        '<td><input type="datetime-local" name="ac_' + w.code + '" value="' + esc(s.actualAt || '') + '" aria-label="' + esc(w.name) + ' 実績日時"></td>' +
        '</tr>';
    }).join('');
  }

  function readSteps(form, dir) {
    return M.workflow(dir).map((w) => {
      const pl = form.querySelector('[name="pl_' + w.code + '"]');
      const ac = form.querySelector('[name="ac_' + w.code + '"]');
      return { code: w.code, plannedDate: pl ? pl.value : '', actualAt: ac ? ac.value : '' };
    });
  }

  F.hawb = async function (opt) {
    opt = opt || {};
    const isEdit = !!opt.hawb;
    const snap = await App.repo.snapshot();
    if (!snap.mawbs.length) { U.toast('先にMAWBを登録してください', 'warn'); return; }
    const h = opt.hawb || {
      mawbId: opt.mawbId || '', special: {}, steps: [],
      pieces: '', weightKg: '', volumeWeightKg: '',
    };
    const sp = h.special || {};
    const mawbs = snap.mawbs.slice().sort((a, b) => a.mawbNo.localeCompare(b.mawbNo));
    const assignees = [...new Set(snap.hawbs.map((x) => x.assignee).filter(Boolean))].sort();
    const mawbOpt = mawbs.map((m) =>
      '<option value="' + m.id + '"' + (m.id === h.mawbId ? ' selected' : '') + '>' +
      esc(m.mawbNo + '［' + M.dirLabel(m.direction) + '］' + (m.flightNo || '') + ' ' + m.origin + '→' + m.destination +
        (m.etd ? ' ETD ' + U.fmtDate(m.etd) : '')) + '</option>').join('');

    const spField = (key, label, placeholder) =>
      '<div class="sp-field">' +
        '<label class="check"><input type="checkbox" name="' + key + '"' + (sp[key] ? ' checked' : '') + '> ' + esc(label) + '</label>' +
        '<input name="' + key + 'Note" value="' + esc(sp[key + 'Note'] || '') + '" placeholder="' + esc(placeholder) + '"' + (sp[key] ? '' : ' hidden') + ' aria-label="' + esc(label) + 'の内容">' +
      '</div>';

    const body =
      '<form class="form" novalidate>' +
      '<div class="form-errors" hidden></div>' +
      field('親MAWB', '<select name="mawbId"><option value="">選択してください</option>' + mawbOpt + '</select>', { required: true }) +
      '<div class="grid-2">' +
        field('HAWB番号', input('hawbNo', h.hawbNo, 'autocomplete="off" placeholder="TYO-24110101"'), { required: true }) +
        field('担当者', input('assignee', h.assignee, 'list="assignee-list" autocomplete="off" placeholder="佐藤"') +
          '<datalist id="assignee-list">' + assignees.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist>') +
        field('荷主（輸出者 / Shipper）', input('shipper', h.shipper), { required: true }) +
        field('荷受人（輸入者 / Consignee）', input('consignee', h.consignee), { required: true }) +
        field('品名', input('commodity', h.commodity), { cls: 'span-2' }) +
      '</div>' +
      '<div class="grid-3">' +
        field('個数', input('pieces', h.pieces, 'type="number" min="0" step="1" inputmode="numeric"')) +
        field('重量（kg）', input('weightKg', h.weightKg, 'type="number" min="0" step="0.1" inputmode="decimal"')) +
        field('容積重量（kg）', input('volumeWeightKg', h.volumeWeightKg, 'type="number" min="0" step="0.1" inputmode="decimal"')) +
      '</div>' +
      '<fieldset class="special-box"><legend>特殊貨物</legend>' +
        spField('dg', '危険品', '例：UN3481 Class 9') +
        spField('reefer', '保冷品', '例：2〜8℃ 定温') +
        spField('other', 'その他特殊貨物', '例：重量物・高額品・美術品') +
      '</fieldset>' +
      '<fieldset class="steps-box"><legend>工程の予定日・実績</legend>' +
        '<div class="steps-tools">' +
          '<button type="button" class="btn btn-sm" data-autofill="blank">ETD/ETAから予定日を入力（空欄のみ）</button>' +
          '<button type="button" class="btn btn-sm" data-autofill="all">すべて上書き</button>' +
        '</div>' +
        '<p class="field-hint">実績は通常、詳細画面の「完了にする」ボタンで自動記録されます。ここでは修正が必要なときだけ変更してください。</p>' +
        '<div class="table-scroll"><table class="steps-table"><thead><tr><th>#</th><th>工程</th><th>予定日</th><th>実績日時</th></tr></thead>' +
        '<tbody data-steps></tbody></table></div>' +
      '</fieldset>' +
      field('メモ', '<textarea name="memo" rows="3">' + esc(h.memo || '') + '</textarea>') +
      '</form>';

    const modal = U.openModal({
      title: isEdit ? 'HAWBを編集' : 'HAWBを登録',
      body, wide: true,
      footer: '<button type="button" class="btn" data-close>キャンセル</button><button type="button" class="btn btn-primary" data-save>保存</button>',
    });
    const form = modal.el.querySelector('form');
    const tbody = form.querySelector('[data-steps]');
    const mawbSel = form.querySelector('[name="mawbId"]');
    const curMawb = () => snap.mawbs.find((m) => m.id === mawbSel.value);
    let curDir = null;
    let stepsCache = h.steps || [];

    const renderSteps = () => {
      const m = curMawb();
      if (curDir) stepsCache = readSteps(form, curDir);
      if (!m) { tbody.innerHTML = '<tr><td colspan="4" class="muted">親MAWBを選ぶと工程が表示されます</td></tr>'; curDir = null; return; }
      curDir = m.direction;
      tbody.innerHTML = stepRows(m.direction, stepsCache);
    };
    renderSteps();
    if (!isEdit && curMawb()) {
      // 新規登録時は最初から予定日を自動入力しておく
      const steps = readSteps(form, curDir);
      M.autofillPlanned(steps, curDir, curMawb().etd, curMawb().eta, false);
      stepsCache = steps; curDir = null; renderSteps();
    }
    mawbSel.addEventListener('change', () => {
      const wasEmpty = !curDir;
      renderSteps();
      if (wasEmpty && curMawb() && !isEdit) {
        const steps = readSteps(form, curDir);
        M.autofillPlanned(steps, curDir, curMawb().etd, curMawb().eta, false);
        stepsCache = steps; curDir = null; renderSteps();
      }
    });

    form.querySelectorAll('[data-autofill]').forEach((b) => b.addEventListener('click', () => {
      const m = curMawb();
      if (!m) { U.toast('先に親MAWBを選んでください', 'warn'); return; }
      if (!m.etd && !m.eta) { U.toast('親MAWBにETD/ETAが入っていません', 'warn'); return; }
      const steps = readSteps(form, curDir);
      M.autofillPlanned(steps, curDir, m.etd, m.eta, b.dataset.autofill === 'all');
      stepsCache = steps; curDir = null; renderSteps();
      U.toast('予定日を入力しました', 'ok');
    }));

    ['dg', 'reefer', 'other'].forEach((k) => {
      const cb = form.querySelector('[name="' + k + '"]');
      const note = form.querySelector('[name="' + k + 'Note"]');
      cb.addEventListener('change', () => { note.hidden = !cb.checked; if (cb.checked) note.focus(); });
    });

    const save = async () => {
      const v = U.formData(form);
      const errors = [];
      if (!v.mawbId) errors.push({ name: 'mawbId', msg: '親MAWBを選んでください' });
      if (!v.hawbNo) errors.push({ name: 'hawbNo', msg: 'HAWB番号を入力してください' });
      if (!v.shipper) errors.push({ name: 'shipper', msg: '荷主（輸出者）を入力してください' });
      if (!v.consignee) errors.push({ name: 'consignee', msg: '荷受人（輸入者）を入力してください' });
      ['pieces', 'weightKg', 'volumeWeightKg'].forEach((k) => {
        if (v[k] !== '' && (U.num(v[k]) === null || U.num(v[k]) < 0)) errors.push({ name: k, msg: '個数・重量は0以上の数値で入力してください' });
      });
      [['dg', '危険品'], ['reefer', '保冷品'], ['other', 'その他特殊貨物']].forEach(([k, label]) => {
        if (v[k] && !v[k + 'Note']) errors.push({ name: k + 'Note', msg: label + 'の内容を入力してください' });
      });
      const steps = curDir ? readSteps(form, curDir) : [];
      let seenEmpty = false;
      steps.forEach((s, i) => {
        if (!s.actualAt) seenEmpty = true;
        else if (seenEmpty) errors.push({ name: 'ac_' + s.code, msg: '「' + M.workflow(curDir)[i].name + '」より前に実績が空欄の工程があります。工程は順番に進めてください' });
      });
      showErrors(form, errors);
      if (errors.length) return;

      const data = Object.assign({}, h, {
        mawbId: v.mawbId, hawbNo: v.hawbNo, shipper: v.shipper, consignee: v.consignee,
        commodity: v.commodity, assignee: v.assignee,
        pieces: U.num(v.pieces), weightKg: U.num(v.weightKg), volumeWeightKg: U.num(v.volumeWeightKg),
        special: {
          dg: v.dg, dgNote: v.dg ? v.dgNote : '', reefer: v.reefer, reeferNote: v.reefer ? v.reeferNote : '',
          other: v.other, otherNote: v.other ? v.otherNote : '',
        },
        memo: v.memo, steps,
      });
      try {
        const saved = await App.repo.saveHawb(data);
        modal.close();
        U.toast(isEdit ? 'HAWBを更新しました' : 'HAWBを登録しました', 'ok');
        if (opt.onSaved) opt.onSaved(saved);
      } catch (e) {
        showErrors(form, [{ name: 'hawbNo', msg: e.message }]);
      }
    };
    modal.el.querySelector('[data-save]').addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  };

  // ======================= 手入力タスク =======================
  F.manualTask = async function (opt) {
    opt = opt || {};
    const isEdit = !!opt.task;
    const snap = await App.repo.snapshot();
    if (!snap.hawbs.length) { U.toast('先にHAWBを登録してください', 'warn'); return; }
    const t = opt.task || { hawbId: opt.hawbId || '', date: opt.date || U.today(), content: '', done: false };
    const mawbById = {};
    snap.mawbs.forEach((m) => { mawbById[m.id] = m; });
    const hawbs = snap.hawbs.slice().sort((a, b) =>
      (mawbById[a.mawbId] || {}).mawbNo.localeCompare((mawbById[b.mawbId] || {}).mawbNo) || a.hawbNo.localeCompare(b.hawbNo));
    const opts = hawbs.map((h) => {
      const m = mawbById[h.mawbId] || {};
      return '<option value="' + h.id + '"' + (h.id === t.hawbId ? ' selected' : '') + '>' +
        esc(h.hawbNo + '（MAWB ' + m.mawbNo + '）' + h.shipper + ' → ' + h.consignee) + '</option>';
    }).join('');
    const tomorrow = U.addDays(U.today(), 1);
    const body =
      '<form class="form" novalidate><div class="form-errors" hidden></div>' +
      field('対象HAWB', '<select name="hawbId"><option value="">選択してください</option>' + opts + '</select>', { required: true }) +
      field('日付', input('date', t.date, 'type="date"') +
        '<span class="quick-dates"><button type="button" class="btn btn-sm" data-d="' + U.today() + '">今日</button>' +
        '<button type="button" class="btn btn-sm" data-d="' + tomorrow + '">明日</button></span>', { required: true }) +
      field('タスクの内容', input('content', t.content, 'placeholder="例：荷主にインボイスを催促" autocomplete="off"'), { required: true }) +
      '</form>';
    const modal = U.openModal({
      title: isEdit ? 'タスクを編集' : 'タスクを追加',
      body,
      footer: (isEdit ? '<button type="button" class="btn btn-danger-outline" data-del>削除</button><span class="spacer"></span>' : '') +
        '<button type="button" class="btn" data-close>キャンセル</button><button type="button" class="btn btn-primary" data-save>保存</button>',
    });
    const form = modal.el.querySelector('form');
    form.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { form.querySelector('[name="date"]').value = b.dataset.d; }));
    const save = async () => {
      const v = U.formData(form);
      const errors = [];
      if (!v.hawbId) errors.push({ name: 'hawbId', msg: '対象HAWBを選んでください' });
      if (!v.date) errors.push({ name: 'date', msg: '日付を入力してください' });
      if (!v.content) errors.push({ name: 'content', msg: 'タスクの内容を入力してください' });
      showErrors(form, errors);
      if (errors.length) return;
      await App.repo.saveManualTask(Object.assign({}, t, { hawbId: v.hawbId, date: v.date, content: v.content }));
      modal.close();
      U.toast(isEdit ? 'タスクを更新しました' : 'タスクを追加しました', 'ok');
      if (opt.onSaved) opt.onSaved();
    };
    modal.el.querySelector('[data-save]').addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    const del = modal.el.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      if (!(await U.confirm('このタスクを削除しますか？', { okLabel: '削除', danger: true }))) return;
      await App.repo.deleteManualTask(t.id);
      modal.close();
      U.toast('タスクを削除しました', 'ok');
      if (opt.onSaved) opt.onSaved();
    });
  };

  App.forms = F;
})(window.App);

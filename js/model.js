/**
 * 業務ロジック（進捗計算・遅延判定・MAWBサマリー・タスク生成）
 * 画面にもデータ保存方法にも依存しない純粋な計算だけを置いています。
 * 将来サーバー側に同じロジックを移すときも、このファイルを参照すればOKです。
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;

  const M = {};

  M.workflow = (dir) => cfg.WORKFLOWS[dir] || [];
  /**
   * 工程をブロックごとにまとめる
   * 戻り値: [{ key, label, items: [{ w, i }] }]（ブロック指定のない工程は label が空）
   */
  M.blocks = function (dir) {
    const out = [];
    M.workflow(dir).forEach((w, i) => {
      const key = w.block || '';
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: key ? (cfg.BLOCKS[key] || key) : '', items: [] };
        out.push(g);
      }
      g.items.push({ w, i });
    });
    return out;
  };

  M.dirLabel = (dir) => (cfg.DIRECTIONS[dir] || {}).label || dir;

  /** 輸出入区分に合わせて工程配列を作り直す（同じコードの工程は予定日・実績を引き継ぐ） */
  M.normalizeSteps = function (hawb, dir) {
    const map = {};
    (hawb.steps || []).forEach((s) => { map[s.code] = s; });
    hawb.steps = M.workflow(dir).map((w) => ({
      code: w.code,
      plannedDate: (map[w.code] && map[w.code].plannedDate) || '',
      actualAt: (map[w.code] && map[w.code].actualAt) || '',
    }));
    return hawb;
  };

  /**
   * 進捗状況。工程は順番に進むので「先頭から連続して実績がある数」を完了数とする
   * 戻り値: { done, total, complete, currentName, next: {idx, code, name, plannedDate} | null, pct }
   */
  M.progress = function (hawb, dir) {
    const wf = M.workflow(dir);
    const steps = hawb.steps || [];
    let done = 0;
    while (done < wf.length && steps[done] && steps[done].actualAt) done++;
    const complete = wf.length > 0 && done === wf.length;
    const next = complete ? null : {
      idx: done, code: wf[done].code, name: wf[done].name,
      plannedDate: (steps[done] && steps[done].plannedDate) || '',
    };
    return {
      done, total: wf.length, complete,
      currentName: done ? wf[done - 1].name : '未着手',
      next,
      pct: wf.length ? Math.round((done / wf.length) * 100) : 0,
    };
  };

  /** 工程1つの状態: done / overdue / soon / pending / none(予定日なし) */
  M.stepState = function (step, today) {
    if (step.actualAt) return 'done';
    if (!step.plannedDate) return 'none';
    const d = U.diffDays(today, step.plannedDate);
    if (d < 0) return 'overdue';
    if (d <= cfg.SOON_DAYS) return 'soon';
    return 'pending';
  };

  M.STATE_LABEL = { done: '完了', overdue: '遅延', soon: '期限間近', pending: '予定', none: '予定日未設定' };

  /**
   * HAWBの警告状況
   * { level: 'overdue'|'soon'|'', overdueDays(最大), overdueSteps[], soonSteps[] }
   */
  M.hawbAlert = function (hawb, dir, today) {
    const wf = M.workflow(dir);
    const r = { level: '', overdueDays: 0, overdueSteps: [], soonSteps: [] };
    (hawb.steps || []).forEach((s, i) => {
      const st = M.stepState(s, today);
      const name = wf[i] ? wf[i].name : s.code;
      if (st === 'overdue') {
        r.overdueSteps.push(name);
        r.overdueDays = Math.max(r.overdueDays, U.diffDays(s.plannedDate, today));
      } else if (st === 'soon') {
        r.soonSteps.push(name);
      }
    });
    r.level = r.overdueSteps.length ? 'overdue' : (r.soonSteps.length ? 'soon' : '');
    return r;
  };

  /** 次の工程を完了にする（実績日時を自動記録）。進めた工程名を返す */
  M.advance = function (hawb, dir, now) {
    const p = M.progress(hawb, dir);
    if (!p.next) return null;
    hawb.steps[p.next.idx].actualAt = now || U.now();
    return p.next.name;
  };

  /** 最後に完了した工程を1つ戻す。戻した工程名を返す */
  M.revert = function (hawb, dir) {
    const p = M.progress(hawb, dir);
    if (p.done === 0) return null;
    hawb.steps[p.done - 1].actualAt = '';
    return M.workflow(dir)[p.done - 1].name;
  };

  /**
   * ETD/ETA から予定日を自動入力
   * overwrite=false のときは空欄だけ埋める
   */
  M.autofillPlanned = function (steps, dir, etd, eta, overwrite) {
    const base = { ETD: (etd || '').slice(0, 10), ETA: (eta || '').slice(0, 10) };
    M.workflow(dir).forEach((w, i) => {
      const b = base[w.base];
      if (!b || !steps[i]) return;
      if (overwrite || !steps[i].plannedDate) steps[i].plannedDate = U.addDays(b, w.offset);
    });
    return steps;
  };

  /**
   * MAWBの進捗サマリー
   * slowest: 配下の未完了HAWBのうち、もっとも手前にいる工程（=次にやる工程）
   */
  M.mawbSummary = function (mawb, hawbs, today) {
    const s = { count: hawbs.length, doneCount: 0, slowest: null, overdueCount: 0, soonCount: 0, maxOverdueDays: 0, specials: {} };
    let minDone = Infinity;
    hawbs.forEach((h) => {
      const p = M.progress(h, mawb.direction);
      const a = M.hawbAlert(h, mawb.direction, today);
      if (p.complete) s.doneCount++;
      else if (p.done < minDone) { minDone = p.done; s.slowest = p.next.name; }
      if (a.level === 'overdue') s.overdueCount++;
      else if (a.level === 'soon') s.soonCount++;
      s.maxOverdueDays = Math.max(s.maxOverdueDays, a.overdueDays);
      cfg.SPECIALS.forEach((sp) => { if (h.special && h.special[sp.key]) s.specials[sp.key] = true; });
    });
    s.allDone = s.count > 0 && s.doneCount === s.count;
    return s;
  };

  /** 一覧で表示する相手先：輸出は輸出者（荷主）、輸入は輸入者（荷受人） */
  M.partyLabel = (dir) => (dir === 'IMPORT' ? '輸入者' : '輸出者');
  M.partyName = (h, dir) => (dir === 'IMPORT' ? h.consignee : h.shipper);

  M.hasSpecial = (h) => cfg.SPECIALS.some((sp) => h.special && h.special[sp.key]);

  // ---------- タスク ----------
  M.stepTaskKey = (hawbId, code) => 'S:' + hawbId + ':' + code;
  M.manualTaskKey = (id) => 'M:' + id;

  M.nextMarkColor = function (code) {
    const list = cfg.MARK_COLORS;
    const i = list.findIndex((c) => c.code === (code || ''));
    return list[(i + 1) % list.length].code;
  };

  /**
   * タスク一覧を作る
   * - 工程タスク: 予定日が「今日」「明日」の工程、および予定日を過ぎた未完了工程
   * - 手入力タスク: 日付が「今日」「明日」のもの、および日付を過ぎた未完了のもの
   * 完了済みも「今日」「明日」の分は残す（グレー表示用）
   * 戻り値: { overdue: [], today: [], tomorrow: [] }
   */
  M.buildTasks = function (snap, today) {
    const tomorrow = U.addDays(today, 1);
    const mawbById = {};
    snap.mawbs.forEach((m) => { mawbById[m.id] = m; });
    const hawbById = {};
    snap.hawbs.forEach((h) => { hawbById[h.id] = h; });
    const marks = {};
    (snap.taskMarks || []).forEach((t) => { marks[t.taskKey] = t.color; });

    const out = { overdue: [], today: [], tomorrow: [] };
    const place = (task) => {
      if (task.date === today) out.today.push(task);
      else if (task.date === tomorrow) out.tomorrow.push(task);
      else if (task.date < today && !task.done) {
        task.overdueDays = U.diffDays(task.date, today);
        out.overdue.push(task);
      }
    };

    snap.hawbs.forEach((h) => {
      const m = mawbById[h.mawbId];
      if (!m) return;
      const wf = M.workflow(m.direction);
      const p = M.progress(h, m.direction);
      (h.steps || []).forEach((s, i) => {
        if (!s.plannedDate || !wf[i]) return;
        // 担当者の作業がない工程（仕立て・搭載など）は、前の工程が終わるまでタスクに出さない
        if (wf[i].hideWhileWaiting && !s.actualAt && i !== p.done) return;
        const key = M.stepTaskKey(h.id, s.code);
        place({
          key, kind: 'STEP', date: s.plannedDate, mawb: m, hawb: h,
          content: wf[i].name, stepIdx: i, stepCode: s.code,
          done: !!s.actualAt, canComplete: !s.actualAt && i === p.done,
          color: marks[key] || '',
        });
      });
    });

    (snap.manualTasks || []).forEach((t) => {
      const h = hawbById[t.hawbId];
      const m = h ? mawbById[h.mawbId] : null;
      const key = M.manualTaskKey(t.id);
      place({
        key, kind: 'MANUAL', date: t.date, mawb: m, hawb: h, manual: t,
        content: t.content, done: !!t.done, canComplete: true,
        color: marks[key] || '',
      });
    });

    const cmp = (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      ((a.mawb && a.mawb.mawbNo) || '').localeCompare((b.mawb && b.mawb.mawbNo) || '') ||
      ((a.hawb && a.hawb.hawbNo) || '').localeCompare((b.hawb && b.hawb.hawbNo) || '') ||
      ((a.stepIdx === undefined ? 99 : a.stepIdx) - (b.stepIdx === undefined ? 99 : b.stepIdx));
    out.overdue.sort(cmp); out.today.sort(cmp); out.tomorrow.sort(cmp);
    return out;
  };

  App.model = M;
})(window.App);

/**
 * データの保存・読み込み（リポジトリ層）
 * ------------------------------------------------------------
 * ★ データの保存先に触れるのはこのファイルだけです。
 *   画面側は必ず App.repo.xxx() を通してデータを読み書きします。
 *
 *   すべての関数は Promise を返す（async）形にしているので、
 *   将来サーバー＋データベースに移行するときは、各関数の中身を
 *     await fetch('/api/mawbs', ...)
 *   のような API 呼び出しに書き換えるだけで、画面側はそのまま使えます。
 *
 *   データは「表」ごとに分けて持っています（RDBのテーブルにそのまま対応）
 *     mawbs        … MAWB
 *     hawbs        … HAWB（mawbId で親MAWBを参照）
 *     manualTasks  … 手入力タスク（hawbId で HAWB を参照）
 *     taskMarks    … タスクの自分チェック色（taskKey ごと）
 * ------------------------------------------------------------
 */
(function (App) {
  'use strict';
  const cfg = App.config;
  const U = App.util;
  const M = App.model;

  // ===== 保存先アダプタ（localStorage 版）=====
  const adapter = {
    load() {
      const raw = localStorage.getItem(cfg.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    save(db) {
      localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(db));
    },
  };

  let db = null;
  let storageOk = true;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const emptyDb = () => ({ schemaVersion: cfg.SCHEMA_VERSION, mawbs: [], hawbs: [], manualTasks: [], taskMarks: [] });

  function persist() {
    try {
      adapter.save(db);
      storageOk = true;
    } catch (e) {
      // プライベートブラウズ等で保存できない場合はメモリ上だけで動かす
      storageOk = false;
      console.warn('保存に失敗しました', e);
    }
  }

  function fail(msg) { throw new Error(msg); }

  function mawbOf(id) { return db.mawbs.find((m) => m.id === id); }

  function removeHawbsCascade(hawbIds) {
    const set = new Set(hawbIds);
    const removedTaskIds = new Set(db.manualTasks.filter((t) => set.has(t.hawbId)).map((t) => t.id));
    db.hawbs = db.hawbs.filter((h) => !set.has(h.id));
    db.manualTasks = db.manualTasks.filter((t) => !removedTaskIds.has(t.id));
    db.taskMarks = db.taskMarks.filter((mk) => {
      const p = mk.taskKey.split(':');
      if (p[0] === 'S') return !set.has(p[1]);
      if (p[0] === 'M') return !removedTaskIds.has(p[1]);
      return true;
    });
  }

  const repo = {
    /** 起動時に1回呼ぶ。データが無ければダミーデータを入れる */
    async init() {
      let loaded = null;
      try { loaded = adapter.load(); } catch (e) { storageOk = false; console.warn(e); }
      if (!loaded || loaded.schemaVersion !== cfg.SCHEMA_VERSION) {
        db = App.seed.build();
        persist();
      } else {
        db = Object.assign(emptyDb(), loaded);
      }
    },

    isPersistent() { return storageOk; },

    /** 画面描画用：全データのスナップショット（コピー）を返す */
    async snapshot() { return clone(db); },

    // ---------- MAWB ----------
    async listMawbs() { return clone(db.mawbs); },
    async getMawb(id) { const m = mawbOf(id); return m ? clone(m) : null; },

    async saveMawb(input) {
      const m = clone(input);
      const dup = db.mawbs.find((x) => x.mawbNo === m.mawbNo && x.id !== m.id);
      if (dup) fail('MAWB番号「' + m.mawbNo + '」はすでに登録されています。');
      const now = U.now();
      const idx = db.mawbs.findIndex((x) => x.id === m.id);
      if (idx >= 0) {
        m.createdAt = db.mawbs[idx].createdAt;
        m.updatedAt = now;
        db.mawbs[idx] = m;
        // 輸出入区分が変わった場合に備えて配下HAWBの工程を揃える
        db.hawbs.forEach((h) => { if (h.mawbId === m.id) M.normalizeSteps(h, m.direction); });
      } else {
        m.id = m.id || U.uid('m');
        m.createdAt = m.updatedAt = now;
        db.mawbs.push(m);
      }
      persist();
      return clone(m);
    },

    /** MAWBを削除（配下のHAWB・タスクもまとめて削除） */
    async deleteMawb(id) {
      removeHawbsCascade(db.hawbs.filter((h) => h.mawbId === id).map((h) => h.id));
      db.mawbs = db.mawbs.filter((m) => m.id !== id);
      persist();
    },

    // ---------- HAWB ----------
    async listHawbs(mawbId) {
      return clone(mawbId ? db.hawbs.filter((h) => h.mawbId === mawbId) : db.hawbs);
    },
    async getHawb(id) { const h = db.hawbs.find((x) => x.id === id); return h ? clone(h) : null; },

    async saveHawb(input) {
      const h = clone(input);
      const parent = mawbOf(h.mawbId);
      if (!parent) fail('親MAWBが見つかりません。');
      const dup = db.hawbs.find((x) => x.hawbNo === h.hawbNo && x.id !== h.id);
      if (dup) fail('HAWB番号「' + h.hawbNo + '」はすでに登録されています。');
      M.normalizeSteps(h, parent.direction);
      const now = U.now();
      const idx = db.hawbs.findIndex((x) => x.id === h.id);
      if (idx >= 0) {
        h.createdAt = db.hawbs[idx].createdAt;
        h.updatedAt = now;
        db.hawbs[idx] = h;
      } else {
        h.id = h.id || U.uid('h');
        h.createdAt = h.updatedAt = now;
        db.hawbs.push(h);
      }
      persist();
      return clone(h);
    },

    async deleteHawb(id) {
      removeHawbsCascade([id]);
      persist();
    },

    // ---------- 手入力タスク ----------
    async listManualTasks() { return clone(db.manualTasks); },

    async saveManualTask(input) {
      const t = clone(input);
      const now = U.now();
      const idx = db.manualTasks.findIndex((x) => x.id === t.id);
      if (idx >= 0) {
        t.createdAt = db.manualTasks[idx].createdAt;
        t.updatedAt = now;
        db.manualTasks[idx] = t;
      } else {
        t.id = t.id || U.uid('t');
        t.createdAt = t.updatedAt = now;
        db.manualTasks.push(t);
      }
      persist();
      return clone(t);
    },

    async deleteManualTask(id) {
      db.manualTasks = db.manualTasks.filter((t) => t.id !== id);
      db.taskMarks = db.taskMarks.filter((mk) => mk.taskKey !== M.manualTaskKey(id));
      persist();
    },

    // ---------- 自分チェック色 ----------
    async setTaskMark(taskKey, color) {
      db.taskMarks = db.taskMarks.filter((mk) => mk.taskKey !== taskKey);
      if (color) db.taskMarks.push({ taskKey, color, updatedAt: U.now() });
      persist();
    },

    // ---------- 一括操作（CSV取込・初期化） ----------
    /**
     * MAWB・HAWBをまとめて反映する
     * mode = 'upsert'  : 渡されたものを追加・更新（既存のその他データは残す）
     * mode = 'replace' : MAWB・HAWB・タスクをすべて入れ替える
     */
    async bulkImport(mawbs, hawbs, mode) {
      if (mode === 'replace') {
        db = emptyDb();
      }
      const now = U.now();
      mawbs.forEach((m) => {
        const idx = db.mawbs.findIndex((x) => x.id === m.id);
        if (idx >= 0) db.mawbs[idx] = Object.assign({}, db.mawbs[idx], m, { updatedAt: now });
        else db.mawbs.push(Object.assign({ createdAt: now }, m, { updatedAt: now }));
      });
      hawbs.forEach((h) => {
        const parent = mawbOf(h.mawbId);
        if (parent) M.normalizeSteps(h, parent.direction);
        const idx = db.hawbs.findIndex((x) => x.id === h.id);
        if (idx >= 0) db.hawbs[idx] = Object.assign({}, db.hawbs[idx], h, { updatedAt: now });
        else db.hawbs.push(Object.assign({ createdAt: now }, h, { updatedAt: now }));
      });
      persist();
    },

    /** ダミーデータに戻す */
    async resetToSeed() {
      db = App.seed.build();
      persist();
    },
  };

  App.repo = repo;
})(window.App);

/**
 * CSV・データ管理画面
 */
(function (App) {
  'use strict';
  const U = App.util;
  const esc = U.esc;

  async function render(container) {
    const snap = await App.repo.snapshot();
    const el = document.createElement('div');
    el.innerHTML =
      '<nav class="crumbs" aria-label="パンくず"><a href="#/progress">進捗管理</a><span>›</span><span>CSV・データ管理</span></nav>' +
      '<div class="page-head"><h1>CSV・データ管理</h1></div>' +
      (App.repo.isPersistent() ? '' : '<div class="notice warn">このブラウザではデータを保存できません（プライベートモード等）。画面を閉じると変更は消えます。</div>') +
      '<div class="detail-grid mawb">' +
        '<section class="card"><h2>CSVエクスポート</h2>' +
          '<p>登録されているすべてのMAWB・HAWB（' + snap.mawbs.length + '件 / ' + snap.hawbs.length + '件）をCSVで保存します。1行がHAWB 1件です。Excelでそのまま開けます。</p>' +
          '<button type="button" class="btn btn-primary" data-act="export">CSVをダウンロード</button></section>' +
        '<section class="card"><h2>CSVインポート</h2>' +
          '<p>このアプリから出力したCSVと同じ形式で取り込めます。</p>' +
          '<div class="field"><span class="field-label">取込方法</span>' +
            '<label class="radio"><input type="radio" name="mode" value="upsert" checked> MAWB番号・HAWB番号で照合して、<strong>追加・更新</strong>する（おすすめ）</label>' +
            '<label class="radio"><input type="radio" name="mode" value="replace"> 今のデータを<strong>すべて削除して入れ替える</strong>（手入力タスク・自分チェックも消えます）</label>' +
          '</div>' +
          '<label class="btn file-btn">CSVファイルを選ぶ<input type="file" accept=".csv,text/csv" data-file hidden></label>' +
          '<div data-preview></div></section>' +
      '</div>' +
      '<section class="card"><h2>デモデータ</h2>' +
        '<p>データを最初のダミーデータの状態に戻します。日付は今日を基準に作り直されます。</p>' +
        '<button type="button" class="btn btn-danger-outline" data-act="reset">ダミーデータに戻す</button></section>';
    container.replaceChildren(el);

    const preview = el.querySelector('[data-preview]');
    let fileText = null;

    const showPlan = () => {
      if (fileText === null) return;
      const mode = el.querySelector('[name="mode"]:checked').value;
      const plan = App.csv.plan(fileText, snap, mode);
      const c = plan.counts;
      const list = (items, cls) => items.length
        ? '<ul class="msg-list ' + cls + '">' + items.slice(0, 30).map((x) => '<li>' + esc(x) + '</li>').join('') +
          (items.length > 30 ? '<li>…ほか' + (items.length - 30) + '件</li>' : '') + '</ul>' : '';
      preview.innerHTML =
        '<div class="import-preview">' +
          '<h3>取込内容の確認</h3>' +
          '<table class="mini-table"><tr><th></th><th>追加</th><th>更新</th></tr>' +
            '<tr><th>MAWB</th><td>' + c.mawbAdd + '件</td><td>' + c.mawbUpd + '件</td></tr>' +
            '<tr><th>HAWB</th><td>' + c.hawbAdd + '件</td><td>' + c.hawbUpd + '件</td></tr></table>' +
          (mode === 'replace' ? '<p class="warn-text">※ 取り込むと、今あるデータ（MAWB ' + snap.mawbs.length + '件・HAWB ' + snap.hawbs.length + '件・タスク）はすべて削除されます。</p>' : '') +
          (plan.errors.length ? '<p class="err-text">エラー ' + plan.errors.length + '件（エラーの行は取り込まれません）</p>' + list(plan.errors, 'err') : '') +
          (plan.warnings.length ? '<p class="warn-text">注意 ' + plan.warnings.length + '件</p>' + list(plan.warnings, 'warn') : '') +
          '<div class="right"><button type="button" class="btn" data-act="cancel-import">やめる</button>' +
          '<button type="button" class="btn btn-primary" data-act="do-import"' + ((plan.mawbs.length || plan.hawbs.length) ? '' : ' disabled') + '>この内容で取り込む</button></div>' +
        '</div>';
      preview.querySelector('[data-act="do-import"]').onclick = async () => {
        if (mode === 'replace' && !(await U.confirm('今のデータをすべて削除して、CSVの内容に入れ替えます。よろしいですか？', { okLabel: '入れ替える', danger: true }))) return;
        await App.repo.bulkImport(plan.mawbs, plan.hawbs, mode);
        U.toast('CSVを取り込みました（MAWB ' + plan.mawbs.length + '件・HAWB ' + plan.hawbs.length + '件）', 'ok');
        location.hash = '#/progress';
      };
      preview.querySelector('[data-act="cancel-import"]').onclick = () => { fileText = null; preview.innerHTML = ''; el.querySelector('[data-file]').value = ''; };
    };

    el.querySelector('[data-file]').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let text = reader.result;
        // UTF-8として読めない（文字化け）場合は Shift_JIS で読み直す（Excelで保存したCSV対策）
        if (/�/.test(text)) {
          const r2 = new FileReader();
          r2.onload = () => { fileText = r2.result; showPlan(); };
          r2.readAsText(file, 'Shift_JIS');
          return;
        }
        fileText = text;
        showPlan();
      };
      reader.readAsText(file, 'UTF-8');
    });
    el.querySelectorAll('[name="mode"]').forEach((r) => r.addEventListener('change', showPlan));

    el.querySelector('[data-act="export"]').addEventListener('click', async () => {
      const text = App.csv.exportText(await App.repo.snapshot());
      const d = new Date();
      const stamp = U.dateStr(d).replace(/-/g, '') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
      U.download('air_cargo_' + stamp + '.csv', text, 'text/csv;charset=utf-8');
      U.toast('CSVを出力しました', 'ok');
    });
    el.querySelector('[data-act="reset"]').addEventListener('click', async () => {
      if (!(await U.confirm('すべてのデータを削除して、ダミーデータに戻します。よろしいですか？', { okLabel: '戻す', danger: true }))) return;
      await App.repo.resetToSeed();
      U.toast('ダミーデータに戻しました', 'ok');
      location.hash = '#/progress';
    });
  }

  App.views.data = { render };
})(window.App);

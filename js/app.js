/**
 * アプリ本体：画面の切り替え（URLの # で管理）とタブ表示
 *   #/progress     進捗管理（一覧）
 *   #/mawb/{id}    MAWB詳細
 *   #/hawb/{id}    HAWB詳細
 *   #/data         CSV・データ管理
 *   #/tasks        タスク管理
 */
(function (App) {
  'use strict';
  const U = App.util;

  const routes = [
    { re: /^#\/progress$/, tab: 'progress', view: () => App.views.progress, title: '進捗管理' },
    { re: /^#\/mawb\/([\w-]+)$/, tab: 'progress', view: () => App.views.mawb, title: 'MAWB詳細' },
    { re: /^#\/hawb\/([\w-]+)$/, tab: 'progress', view: () => App.views.hawb, title: 'HAWB詳細' },
    { re: /^#\/data$/, tab: 'progress', view: () => App.views.data, title: 'CSV・データ管理' },
    { re: /^#\/tasks$/, tab: 'tasks', view: () => App.views.tasks, title: 'タスク管理' },
  ];

  let lastHash = null;

  async function updateTabs(active) {
    // 今どのメニューの画面かを body に記録（タスク管理だけ背景色を変えるため）
    document.body.dataset.tab = active;
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === active;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    const c = await App.views.tasks.counts();
    const badge = document.getElementById('task-badge');
    // メニューには今日・明日の件数は出さず、期限切れがあるときだけ件数を表示する
    badge.innerHTML = c.overdue ? '<span class="tb tb-overdue" title="期限切れ">期限切れ ' + c.overdue + '</span>' : '';
  }

  async function route() {
    const hash = location.hash || '#/progress';
    const r = routes.find((x) => x.re.test(hash));
    if (!r) { location.replace('#/progress'); return; }
    const param = (hash.match(r.re) || [])[1];
    const main = document.getElementById('main');
    // 画面を移動したら開いているモーダルは閉じる
    if (hash !== lastHash) {
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
      document.body.classList.remove('modal-open');
    }
    try {
      await r.view().render(main, param);
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="notice err">画面の表示中にエラーが発生しました：' + U.esc(e.message) + '</div>';
    }
    document.title = r.title + '｜航空貨物 進捗管理（デモ）';
    await updateTabs(r.tab);
    if (hash !== lastHash) window.scrollTo(0, 0);
    lastHash = hash;
  }

  /** 今の画面を再描画（データ更新後に呼ぶ） */
  App.refresh = function () {
    const y = window.scrollY;
    return route().then(() => window.scrollTo(0, y));
  };

  async function start() {
    await App.repo.init();
    document.getElementById('today-label').textContent = '今日：' + U.fmtDate(U.today(), true);
    window.addEventListener('hashchange', route);
    // 日付が変わったら（タブを開きっぱなしの場合）遅延判定を更新
    let day = U.today();
    setInterval(() => {
      if (U.today() !== day) {
        day = U.today();
        document.getElementById('today-label').textContent = '今日：' + U.fmtDate(day, true);
        App.refresh();
      }
    }, 60 * 1000);
    if (!location.hash) location.replace('#/progress');
    route();
  }

  document.addEventListener('DOMContentLoaded', start);
})(window.App);

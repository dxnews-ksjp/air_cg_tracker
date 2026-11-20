/**
 * AIアシスタントのお知らせ（今日のまとめ）
 * ------------------------------------------------------------
 * デモ版ではAIには接続せず、登録データからルールで文章を作ります。
 * 本番でAIを使う場合も、件数・番号・日付はここ（プログラム）で決めて、
 * AIには「言い回し」だけを担当させる想定です。
 * そうすることで、AIが存在しない番号や誤った件数を話すことを防ぎます。
 * ------------------------------------------------------------
 */
(function (App) {
  'use strict';
  const U = App.util;
  const M = App.model;

  const A = {};

  /**
   * お知らせを作る
   * 戻り値: { at, summary: [{ text, href, level }] }
   */
  A.build = function (snap, today) {
    const tasks = M.buildTasks(snap, today);
    const open = (list) => list.filter((t) => !t.done);
    const todayOpen = open(tasks.today);
    const tomorrowOpen = open(tasks.tomorrow);

    const summary = [];
    summary.push({
      text: '今日の予定は ' + todayOpen.length + ' 件、明日の予定は ' + tomorrowOpen.length + ' 件です',
      href: '#/tasks',
    });
    if (tasks.overdue.length) {
      const names = tasks.overdue.slice(0, 3).map((t) => (t.hawb ? t.hawb.hawbNo : '') + ' ' + t.content);
      summary.push({
        text: '期限切れが ' + tasks.overdue.length + ' 件あります：' + names.join('、') + (tasks.overdue.length > 3 ? ' ほか' : ''),
        href: tasks.overdue.length === 1 && tasks.overdue[0].hawb ? '#/hawb/' + tasks.overdue[0].hawb.id : '#/tasks',
        level: 'danger',
      });
    } else {
      summary.push({ text: '期限切れのタスクはありません', level: 'ok' });
    }
    const special = todayOpen.concat(tomorrowOpen).filter((t) => t.hawb && M.hasSpecial(t.hawb));
    if (special.length) {
      const nos = [...new Set(special.map((t) => t.hawb.hawbNo))];
      summary.push({
        text: '今日・明日に特殊貨物（危険品・保冷品など）の工程が ' + nos.length + ' 件あります：' + nos.slice(0, 3).join('、') + (nos.length > 3 ? ' ほか' : ''),
        href: '#/tasks',
      });
    }

    return { at: U.now(), summary };
  };

  App.assistant = A;
})(window.App);

/**
 * AIアシスタントのお知らせ（今日のまとめ・気づき）
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

  // 一度に表示する気づきの最大件数（お知らせが多すぎて読まれなくなるのを防ぐ）
  const MAX_NOTICES = 5;

  /**
   * 気づきのルール
   * 各ルールは { key, level, text, href } の配列を返す
   */
  const RULES = [
    // 危険品なのに、メモ・危険品内容に SDS / MSDS の記載がない
    function dgWithoutSds(snap) {
      const out = [];
      snap.hawbs.forEach((h) => {
        if (!h.special || !h.special.dg) return;
        const text = [h.memo, h.special.dgNote].join(' ');
        if (/M?SDS|安全データシート/i.test(text)) return;
        const m = snap.mawbs.find((x) => x.id === h.mawbId);
        if (m && M.progress(h, m.direction).complete) return;
        out.push({
          key: 'dg-sds:' + h.id, level: 'warn',
          text: 'HAWB ' + h.hawbNo + '：危険品ですが、メモにSDS（安全データシート）の記載がありません',
          href: '#/hawb/' + h.id,
        });
      });
      return out;
    },
    // 2ND FLT の日付が 1ST FLT の日付より前になっている
    function flightDateOrder(snap) {
      const out = [];
      snap.mawbs.forEach((m) => {
        if (!m.flight2No || !m.flight2Date) return;
        const f1 = m.flightDate || (m.etd || '').slice(0, 10);
        if (!f1 || m.flight2Date >= f1) return;
        out.push({
          key: 'flt-order:' + m.id + ':' + f1 + ':' + m.flight2Date, level: 'warn',
          text: 'MAWB ' + m.mawbNo + '：2ND FLT（' + m.flight2No + ' ' + U.fmtDate(m.flight2Date) +
            '）の日付が 1ST FLT（' + (m.flightNo || '') + ' ' + U.fmtDate(f1) + '）より前になっています',
          href: '#/mawb/' + m.id,
        });
      });
      return out;
    },
  ];

  const A = {};

  /**
   * お知らせを作る
   * 戻り値: { at, summary: [{ text, href, level }], notices: [...], hiddenCount }
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

    const acks = {};
    (snap.noticeAcks || []).forEach((a) => { acks[a.key] = a; });
    let notices = [];
    RULES.forEach((rule) => { notices = notices.concat(rule(snap)); });
    const hiddenCount = notices.filter((n) => acks[n.key]).length;
    notices = notices.filter((n) => !acks[n.key]);
    const more = Math.max(0, notices.length - MAX_NOTICES);

    return { at: U.now(), summary, notices: notices.slice(0, MAX_NOTICES), more, hiddenCount };
  };

  App.assistant = A;
})(window.App);

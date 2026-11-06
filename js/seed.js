/**
 * ダミーデータ（動作確認用）
 * 日付はすべて「今日 + SHIFT_DAYS日」を基準に計算します（ダミーデータに戻すたびに作り直し）。
 * 実績は今日より未来には入れないので、基準日より先の工程は未完了のままになります。
 * 会社名・番号はすべて架空のものです。
 */
(function (App) {
  'use strict';
  const U = App.util;
  const M = App.model;

  // ダミーデータ全体を何日後ろにずらすか（0にすると今日基準）
  const SHIFT_DAYS = 7;
  const base = () => U.addDays(U.today(), SHIFT_DAYS);
  const day = (n) => U.addDays(base(), n);

  function at(dayOffset, hhmm) {
    return day(dayOffset) + 'T' + hhmm;
  }

  function mkMawb(o) {
    const ts = U.now();
    return {
      id: U.uid('m'), mawbNo: U.makeMawbNo(o.prefix, o.serial), direction: o.direction,
      airline: o.airline, flightNo: o.flightNo, flightDate: (o.etd || '').slice(0, 10),
      flight2No: o.flight2No || '', flight2Date: o.flight2Date || '', transit: o.transit || '',
      origin: o.origin, destination: o.destination,
      etd: o.etd, eta: o.eta, createdAt: ts, updatedAt: ts,
    };
  }

  /**
   * o.done     : 先頭から何工程を完了済みにするか
   * o.override : { 工程コード: 基準日からの日数 } で予定日を上書き
   */
  function mkHawb(mawb, o) {
    const ts = U.now();
    const today = U.today();
    const h = {
      id: U.uid('h'), mawbId: mawb.id, hawbNo: o.hawbNo,
      shipper: o.shipper, consignee: o.consignee,
      pieces: o.pieces, weightKg: o.weightKg, volumeWeightKg: o.volumeWeightKg,
      commodity: o.commodity, assignee: o.assignee,
      steps: [],
      special: Object.assign({ dg: false, dgNote: '', reefer: false, reeferNote: '', other: false, otherNote: '' }, o.special || {}),
      memo: o.memo || '', createdAt: ts, updatedAt: ts,
    };
    M.normalizeSteps(h, mawb.direction, mawb);
    M.autofillPlanned(h.steps, mawb.direction, mawb.etd, mawb.eta, true);
    Object.keys(o.override || {}).forEach((code) => {
      const s = h.steps.find((x) => x.code === code);
      if (s) s.plannedDate = day(o.override[code]);
    });
    for (let i = 0; i < (o.done || 0) && i < h.steps.length; i++) {
      const s = h.steps[i];
      if (s.na) continue; // 直行便の経由地は該当なし
      if (!s.plannedDate || s.plannedDate > today) break; // 予定日が今日より先の工程には実績を入れない
      const hour = String(Math.min(8 + i, 20)).padStart(2, '0'); // 後の工程ほど遅い時刻にする
      s.actualAt = s.plannedDate < today ? s.plannedDate + 'T' + hour + ':' + (i % 2 ? '30' : '05') : U.now();
    }
    return h;
  }

  App.seed = {
    build() {
      const mawbs = [], hawbs = [];

      // ① 輸出：成田→ロサンゼルス 明日出発（危険品の集荷が1日遅延 ※期限切れはこの1件だけ）
      const m1 = mkMawb({ prefix: '131', serial: '4521873', direction: 'EXPORT', airline: 'JL', flightNo: 'JL062',
        origin: 'NRT', destination: 'LAX', etd: at(1, '17:55'), eta: at(1, '11:00') });
      mawbs.push(m1);
      hawbs.push(
        mkHawb(m1, { hawbNo: 'TYO-24110101', shipper: '株式会社みなとエナジー', consignee: 'Sunset Battery Supply LLC',
          pieces: 12, weightKg: 180, volumeWeightKg: 160, commodity: 'リチウムイオン電池（機器組込）', assignee: '佐藤', done: 3,
          special: { dg: true, dgNote: 'UN3481 Class 9 / PI967 Section II' },
          memo: '荷主からのMSDS未着。集荷前に要確認。' }),
        mkHawb(m1, { hawbNo: 'TYO-24110102', shipper: '東和精機株式会社', consignee: 'Pacific Instruments Inc.',
          pieces: 6, weightKg: 420, volumeWeightKg: 515, commodity: '精密測定機器', assignee: '鈴木', done: 5 })
      );

      // ② 輸出：関西→シンガポール経由→ジャカルタ 3日前に出発済み（今日が請求予定・完了済み）
      const m2 = mkMawb({ prefix: '618', serial: '3307512', direction: 'EXPORT', airline: 'SQ', flightNo: 'SQ619',
        flight2No: 'SQ956', flight2Date: day(-3), transit: 'SIN',
        origin: 'KIX', destination: 'CGK', etd: at(-3, '11:15'), eta: at(-3, '19:50') });
      mawbs.push(m2);
      hawbs.push(
        mkHawb(m2, { hawbNo: 'OSA-24102801', shipper: '浪速オートパーツ株式会社', consignee: 'PT Nusantara Motor Parts',
          pieces: 20, weightKg: 860, volumeWeightKg: 790, commodity: '自動車部品（ブレーキパッド）', assignee: '高橋', done: 10 }),
        mkHawb(m2, { hawbNo: 'OSA-24102802', shipper: '株式会社関西テクノ', consignee: 'PT Jawa Semikon Indonesia',
          pieces: 1, weightKg: 1250, volumeWeightKg: 1480, commodity: '半導体製造装置部品', assignee: '高橋', done: 12,
          special: { other: true, otherNote: '重量物（1ピース1.25t）・フォークリフト荷役' } })
      );

      // ③ 輸出：成田→仁川 来週出発（美術品）
      const m3 = mkMawb({ prefix: '180', serial: '6140298', direction: 'EXPORT', airline: 'KE', flightNo: 'KE706',
        origin: 'NRT', destination: 'ICN', etd: at(6, '13:40'), eta: at(6, '16:10') });
      mawbs.push(m3);
      hawbs.push(
        mkHawb(m3, { hawbNo: 'TYO-24110301', shipper: 'ギャラリー青山株式会社', consignee: 'Hangang Art Museum',
          pieces: 2, weightKg: 70, volumeWeightKg: 210, commodity: '美術品（額装絵画）', assignee: '田中', done: 1,
          override: { ORDER: -1 },
          special: { other: true, otherNote: '美術品・温湿度管理・天地無用' } })
      );

      // ④ 輸入：ドーハ→成田 今日到着（保冷品）
      const m4 = mkMawb({ prefix: '157', serial: '2896604', direction: 'IMPORT', airline: 'QR', flightNo: 'QR806',
        origin: 'DOH', destination: 'NRT', etd: at(-1, '02:05'), eta: at(0, '17:35') });
      mawbs.push(m4);
      hawbs.push(
        mkHawb(m4, { hawbNo: 'DOH-77810011', shipper: 'Euro Bio Pharma GmbH', consignee: '東京メディカル株式会社',
          pieces: 8, weightKg: 150, volumeWeightKg: 220, commodity: '医療用試薬', assignee: '鈴木', done: 1,
          special: { reefer: true, reeferNote: '-20℃ 冷凍（ドライアイス UN1845 同梱）' } })
      );

      // ⑤〜⑦ 輸出：1MAWB-1HAWB の案件
      const m5 = mkMawb({ prefix: '131', serial: '4537720', direction: 'EXPORT', airline: 'JL', flightNo: 'JL407',
        origin: 'NRT', destination: 'FRA', etd: at(3, '11:25'), eta: at(3, '17:40') });
      mawbs.push(m5);
      hawbs.push(mkHawb(m5, { hawbNo: 'TYO-24110401', shipper: '株式会社光陽オプティクス', consignee: 'Rhein Optik GmbH',
        pieces: 3, weightKg: 85, volumeWeightKg: 120, commodity: '精密光学部品', assignee: '佐藤', done: 3 }));

      const m6 = mkMawb({ prefix: '205', serial: '7781046', direction: 'EXPORT', airline: 'NH', flightNo: 'NH919',
        origin: 'HND', destination: 'PVG', etd: at(1, '09:55'), eta: at(1, '12:30') });
      mawbs.push(m6);
      hawbs.push(mkHawb(m6, { hawbNo: 'TYO-24110402', shipper: '北海フーズ株式会社', consignee: 'Shanghai Ocean Foods Co., Ltd.',
        pieces: 10, weightKg: 240, volumeWeightKg: 260, commodity: '冷凍水産品サンプル', assignee: '田中', done: 4,
        special: { reefer: true, reeferNote: '-18℃以下 冷凍' } }));

      const m7 = mkMawb({ prefix: '297', serial: '2210583', direction: 'EXPORT', airline: 'CI', flightNo: 'CI107',
        flight2No: 'CI835', flight2Date: day(5), transit: 'TPE',
        origin: 'NRT', destination: 'BKK', etd: at(5, '14:20'), eta: at(5, '23:05') });
      mawbs.push(m7);
      hawbs.push(mkHawb(m7, { hawbNo: 'TYO-24110403', shipper: '東邦セミコン株式会社', consignee: 'Siam Electronics Co., Ltd.',
        pieces: 4, weightKg: 60, volumeWeightKg: 95, commodity: '半導体ウエハ', assignee: '鈴木', done: 2,
        special: { other: true, otherNote: '高額品・衝撃注意' } }));

      const byNo = (no) => hawbs.find((h) => h.hawbNo === no);
      const ts = U.now();
      const manualTasks = [
        { id: U.uid('t'), hawbId: byNo('TYO-24110101').id, date: day(0), content: '荷主にMSDS・インボイス原本を催促', done: false, createdAt: ts, updatedAt: ts },
        { id: U.uid('t'), hawbId: byNo('DOH-77810011').id, date: day(0), content: '保冷倉庫の受け入れ枠を確認', done: false, createdAt: ts, updatedAt: ts },
        { id: U.uid('t'), hawbId: byNo('TYO-24110301').id, date: day(1), content: '美術品梱包業者と集荷日を調整', done: false, createdAt: ts, updatedAt: ts },
      ];
      const taskMarks = [
        { taskKey: M.stepTaskKey(byNo('TYO-24110101').id, 'PICKUP'), color: 'RED', updatedAt: ts },
        { taskKey: M.manualTaskKey(manualTasks[0].id), color: 'YELLOW', updatedAt: ts },
      ];

      return { schemaVersion: App.config.SCHEMA_VERSION, mawbs, hawbs, manualTasks, taskMarks };
    },
  };
})(window.App);

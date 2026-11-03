/**
 * ダミーデータ（動作確認用）
 * 日付はすべて「今日」を基準に計算するので、いつ開いても
 * 遅延・期限間近・完了済みの案件が混ざった状態になります。
 * 会社名・番号はすべて架空のものです。
 */
(function (App) {
  'use strict';
  const U = App.util;
  const M = App.model;

  function at(dayOffset, hhmm) {
    return U.addDays(U.today(), dayOffset) + 'T' + hhmm;
  }

  function mkMawb(o) {
    const ts = U.now();
    return {
      id: U.uid('m'), mawbNo: U.makeMawbNo(o.prefix, o.serial), direction: o.direction,
      airline: o.airline, flightNo: o.flightNo, origin: o.origin, destination: o.destination,
      etd: o.etd, eta: o.eta, createdAt: ts, updatedAt: ts,
    };
  }

  /**
   * o.done     : 先頭から何工程を完了済みにするか
   * o.override : { 工程コード: 今日からの日数 } で予定日を上書き
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
    M.normalizeSteps(h, mawb.direction);
    M.autofillPlanned(h.steps, mawb.direction, mawb.etd, mawb.eta, true);
    Object.keys(o.override || {}).forEach((code) => {
      const s = h.steps.find((x) => x.code === code);
      if (s) s.plannedDate = U.addDays(today, o.override[code]);
    });
    for (let i = 0; i < (o.done || 0) && i < h.steps.length; i++) {
      const s = h.steps[i];
      const hour = String(9 + (i % 8)).padStart(2, '0');
      // 実績は未来日にならないようにする
      s.actualAt = s.plannedDate && s.plannedDate < today ? s.plannedDate + 'T' + hour + ':' + (i % 2 ? '30' : '05') : U.now();
    }
    return h;
  }

  App.seed = {
    build() {
      const mawbs = [], hawbs = [];

      // ① 輸出：成田→ロサンゼルス 明日出発（遅延・危険品・保冷品あり）
      const m1 = mkMawb({ prefix: '131', serial: '4521873', direction: 'EXPORT', airline: 'JL', flightNo: 'JL062',
        origin: 'NRT', destination: 'LAX', etd: at(1, '17:55'), eta: at(1, '11:00') });
      mawbs.push(m1);
      hawbs.push(
        mkHawb(m1, { hawbNo: 'TYO-24110101', shipper: '東和精機株式会社', consignee: 'Pacific Instruments Inc.',
          pieces: 6, weightKg: 420, volumeWeightKg: 515, commodity: '精密測定機器', assignee: '佐藤', done: 4 }),
        mkHawb(m1, { hawbNo: 'TYO-24110102', shipper: '株式会社みなとエナジー', consignee: 'Sunset Battery Supply LLC',
          pieces: 12, weightKg: 180, volumeWeightKg: 160, commodity: 'リチウムイオン電池（機器組込）', assignee: '佐藤', done: 3,
          special: { dg: true, dgNote: 'UN3481 Class 9 / PI967 Section II' },
          memo: '荷主からのMSDS未着。集荷前に要確認。' }),
        mkHawb(m1, { hawbNo: 'TYO-24110103', shipper: 'さくら製薬株式会社', consignee: 'West Coast Medical Corp.',
          pieces: 4, weightKg: 95, volumeWeightKg: 140, commodity: '医薬品（錠剤）', assignee: '鈴木', done: 6,
          special: { reefer: true, reeferNote: '2〜8℃ 定温管理（保冷BOX使用）' } })
      );

      // ② 輸出：関西→シンガポール 3日前に出発済み（請求待ち・完了・到着確認遅れ）
      const m2 = mkMawb({ prefix: '618', serial: '3307512', direction: 'EXPORT', airline: 'SQ', flightNo: 'SQ619',
        origin: 'KIX', destination: 'SIN', etd: at(-3, '11:15'), eta: at(-3, '17:05') });
      mawbs.push(m2);
      hawbs.push(
        mkHawb(m2, { hawbNo: 'OSA-24102801', shipper: '浪速オートパーツ株式会社', consignee: 'Lion City Motors Pte. Ltd.',
          pieces: 20, weightKg: 860, volumeWeightKg: 790, commodity: '自動車部品（ブレーキパッド）', assignee: '高橋', done: 9 }),
        mkHawb(m2, { hawbNo: 'OSA-24102802', shipper: '株式会社関西テクノ', consignee: 'Straits Semicon Pte. Ltd.',
          pieces: 1, weightKg: 1250, volumeWeightKg: 1480, commodity: '半導体製造装置部品', assignee: '高橋', done: 11,
          special: { other: true, otherNote: '重量物（1ピース1.25t）・フォークリフト荷役' } }),
        mkHawb(m2, { hawbNo: 'OSA-24102803', shipper: '株式会社ミヤビアパレル', consignee: 'Orchard Fashion Pte. Ltd.',
          pieces: 3, weightKg: 45, volumeWeightKg: 62, commodity: '衣料品サンプル', assignee: '田中', done: 8 })
      );

      // ③ 輸出：成田→仁川 来週出発（受注前・美術品）
      const m3 = mkMawb({ prefix: '180', serial: '6140298', direction: 'EXPORT', airline: 'KE', flightNo: 'KE706',
        origin: 'NRT', destination: 'ICN', etd: at(6, '13:40'), eta: at(6, '16:10') });
      mawbs.push(m3);
      hawbs.push(
        mkHawb(m3, { hawbNo: 'TYO-24110301', shipper: 'ルミエール化粧品株式会社', consignee: 'Seoul Beauty Trading Co., Ltd.',
          pieces: 30, weightKg: 310, volumeWeightKg: 355, commodity: '化粧品（ヘアスプレー）', assignee: '鈴木', done: 0,
          special: { dg: true, dgNote: 'UN1950 エアゾール Class 2.1' } }),
        mkHawb(m3, { hawbNo: 'TYO-24110302', shipper: 'ギャラリー青山株式会社', consignee: 'Hangang Art Museum',
          pieces: 2, weightKg: 70, volumeWeightKg: 210, commodity: '美術品（額装絵画）', assignee: '田中', done: 1,
          override: { ORDER: -1 },
          special: { other: true, otherNote: '美術品・温湿度管理・天地無用' } })
      );

      // ④ 輸入：ドーハ→成田 今日到着（プレアラート遅れ・保冷品・危険品）
      const m4 = mkMawb({ prefix: '157', serial: '2896604', direction: 'IMPORT', airline: 'QR', flightNo: 'QR806',
        origin: 'DOH', destination: 'NRT', etd: at(-1, '02:05'), eta: at(0, '17:35') });
      mawbs.push(m4);
      hawbs.push(
        mkHawb(m4, { hawbNo: 'DOH-77810011', shipper: 'Gulf Electronics W.L.L.', consignee: '株式会社ひかり電子',
          pieces: 15, weightKg: 240, volumeWeightKg: 300, commodity: '電子部品（コネクタ）', assignee: '佐藤', done: 1 }),
        mkHawb(m4, { hawbNo: 'DOH-77810012', shipper: 'Euro Bio Pharma GmbH', consignee: '東京メディカル株式会社',
          pieces: 8, weightKg: 150, volumeWeightKg: 220, commodity: '医療用試薬', assignee: '鈴木', done: 1,
          special: { reefer: true, reeferNote: '-20℃ 冷凍（ドライアイス UN1845 同梱）' } }),
        mkHawb(m4, { hawbNo: 'DOH-77810013', shipper: 'Desert Coatings Co.', consignee: '日東ペイント工業株式会社',
          pieces: 10, weightKg: 380, volumeWeightKg: 340, commodity: '塗料', assignee: '高橋', done: 0,
          special: { dg: true, dgNote: 'UN1263 Class 3 引火性液体' },
          memo: 'プレアラート未着。海外代理店に催促中。' }),
        mkHawb(m4, { hawbNo: 'DOH-77810014', shipper: 'Al Noor Machinery LLC', consignee: '株式会社北関東機工',
          pieces: 2, weightKg: 520, volumeWeightKg: 480, commodity: '産業機械部品', assignee: '田中', done: 1 })
      );

      // ⑤ 輸入：香港→成田 4日前に到着（配送手配の遅れ・請求待ち）
      const m5 = mkMawb({ prefix: '160', serial: '5023417', direction: 'IMPORT', airline: 'CX', flightNo: 'CX504',
        origin: 'HKG', destination: 'NRT', etd: at(-4, '09:20'), eta: at(-4, '14:30') });
      mawbs.push(m5);
      hawbs.push(
        mkHawb(m5, { hawbNo: 'HKG-55302101', shipper: 'Victoria Watch Co., Ltd.', consignee: '銀座タイムピース株式会社',
          pieces: 5, weightKg: 32, volumeWeightKg: 40, commodity: '腕時計', assignee: '佐藤', done: 6,
          special: { other: true, otherNote: '高額品（バリュアブル）・保管時施錠' } }),
        mkHawb(m5, { hawbNo: 'HKG-55302102', shipper: 'Kowloon Publishing Ltd.', consignee: '株式会社みらい書房',
          pieces: 18, weightKg: 410, volumeWeightKg: 380, commodity: '書籍', assignee: '田中', done: 8 })
      );

      const byNo = (no) => hawbs.find((h) => h.hawbNo === no);
      const ts = U.now();
      const manualTasks = [
        { id: U.uid('t'), hawbId: byNo('TYO-24110102').id, date: U.today(), content: '荷主にMSDS・インボイス原本を催促', done: false, createdAt: ts, updatedAt: ts },
        { id: U.uid('t'), hawbId: byNo('HKG-55302101').id, date: U.today(), content: '配送業者へ配達日時を再連絡', done: false, createdAt: ts, updatedAt: ts },
        { id: U.uid('t'), hawbId: byNo('DOH-77810013').id, date: U.addDays(U.today(), 1), content: '通関業者へSDS（安全データシート）を送付', done: false, createdAt: ts, updatedAt: ts },
      ];
      const taskMarks = [
        { taskKey: M.stepTaskKey(byNo('TYO-24110102').id, 'PICKUP'), color: 'RED', updatedAt: ts },
        { taskKey: M.manualTaskKey(manualTasks[0].id), color: 'YELLOW', updatedAt: ts },
      ];

      return { schemaVersion: App.config.SCHEMA_VERSION, mawbs, hawbs, manualTasks, taskMarks };
    },
  };
})(window.App);

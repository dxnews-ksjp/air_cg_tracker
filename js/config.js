/**
 * 設定ファイル
 * 工程の定義・警告の基準日数・色マーカーなど、業務ルールに関わる値はここにまとめています。
 * 工程を追加・変更したいときは WORKFLOWS を書き換えてください。
 */
window.App = window.App || {};

App.config = {
  // localStorage の保存キー（データ構造を大きく変えたら末尾の番号を上げる）
  STORAGE_KEY: 'airCargoTracker.v1',
  SCHEMA_VERSION: 1,

  // 「期限間近（黄色）」とみなす日数。1 = 予定日が「今日」または「明日」
  SOON_DAYS: 1,

  DIRECTIONS: {
    EXPORT: { label: '輸出', short: '輸出' },
    IMPORT: { label: '輸入', short: '輸入' },
  },

  /**
   * 工程定義（上から順に進む）
   * code   : データ保存用の識別子（変更しないこと）
   * name   : 画面表示名
   * base/offset : 「ETD/ETAから予定日を自動入力」したときの基準日と日数
   * block  : 工程のまとまり（BLOCKS のキー）。一覧・詳細で見出しを付けて区切ります
   * hideWhileWaiting : true の工程は、前の工程が終わるまで（＝前工程待ちの間）タスク管理に表示しない
   * naIfDirect : true の工程は、直行便（MAWBに2nd FLTがない）のとき「該当なし」になり、飛ばして進む
   */
  WORKFLOWS: {
    EXPORT: [
      // 国内
      { code: 'ORDER',        name: '受注',         base: 'ETD', offset: -5, block: 'DOMESTIC' },
      { code: 'BOOKING',      name: 'ブッキング',   base: 'ETD', offset: -4, block: 'DOMESTIC' },
      { code: 'SPACE',        name: 'コンファーム', base: 'ETD', offset: -3, block: 'DOMESTIC' },
      { code: 'PICKUP',       name: '集荷',         base: 'ETD', offset: -2, block: 'DOMESTIC' },
      { code: 'EXP_CUSTOMS',  name: '通関',         base: 'ETD', offset: -1, block: 'DOMESTIC' },
      { code: 'BUILD_UP',     name: '仕立て',       base: 'ETD', offset: -1, block: 'DOMESTIC', hideWhileWaiting: true },
      { code: 'LOADED',       name: '搭載',         base: 'ETD', offset: 0,  block: 'DOMESTIC', hideWhileWaiting: true },
      // 国際
      { code: 'DEPARTED',     name: '出発',         base: 'ETD', offset: 0,  block: 'INTERNATIONAL', hideWhileWaiting: true },
      { code: 'TRANSIT',      name: '経由地',       base: 'ETD', offset: 0,  block: 'INTERNATIONAL', hideWhileWaiting: true, naIfDirect: true },
      { code: 'ARRIVED',      name: '到着',         base: 'ETA', offset: 0,  block: 'INTERNATIONAL', hideWhileWaiting: true },
      // 海外（今後、海外での通関・配送などの工程をここに追加予定）
      // 請求・完了
      { code: 'BILLING',      name: '請求',         base: 'ETA', offset: 3,  block: 'CLOSING' },
      { code: 'DONE',         name: '完了',         base: 'ETA', offset: 5,  block: 'CLOSING' },
    ],
    IMPORT: [
      { code: 'PRE_ALERT',    name: 'プレアラート受領', base: 'ETA', offset: -2 },
      { code: 'TRANSIT',      name: '経由地',           base: 'ETD', offset: 0, hideWhileWaiting: true, naIfDirect: true },
      { code: 'ARRIVED',      name: '到着',             base: 'ETA', offset: 0 },
      { code: 'BONDED_IN',    name: '保税搬入',         base: 'ETA', offset: 0 },
      { code: 'DO_DOCS',      name: 'D/O・書類受領',    base: 'ETA', offset: 1 },
      { code: 'IMP_CUSTOMS',  name: '輸入通関申告',     base: 'ETA', offset: 1 },
      { code: 'IMP_PERMIT',   name: '輸入許可',         base: 'ETA', offset: 2 },
      { code: 'DELIVERY_ARR', name: '配送手配',         base: 'ETA', offset: 2 },
      { code: 'DELIVERED',    name: '配達完了',         base: 'ETA', offset: 3 },
      { code: 'BILLING',      name: '請求',             base: 'ETA', offset: 5 },
      { code: 'DONE',         name: '完了',             base: 'ETA', offset: 7 },
    ],
  },

  // 工程のまとまり（表示名）
  BLOCKS: {
    DOMESTIC: '国内',
    INTERNATIONAL: '国際',
    OVERSEAS: '海外',
    CLOSING: '請求・完了',
  },

  // タスク管理タブの「自分チェック用」色マーカー（クリックするたびに順番に切り替わる）
  MARK_COLORS: [
    { code: '',       label: 'なし' },
    { code: 'RED',    label: '要対応' },
    { code: 'YELLOW', label: '対応中' },
    { code: 'GREEN',  label: '確認済み' },
  ],

  // 特殊貨物の種類
  SPECIALS: [
    { key: 'dg',     label: '危険品',       short: '危', cls: 'sp-dg' },
    { key: 'reefer', label: '保冷品',       short: '冷', cls: 'sp-reefer' },
    { key: 'other',  label: 'その他特殊',   short: '特', cls: 'sp-other' },
  ],
};

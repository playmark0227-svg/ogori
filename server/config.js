// オゴリ (OGORI) プラットフォーム — 事業ルール・定数
// PDF「社長のお米が直接家に届く福利厚生サービス」の内容を反映。

export const BRAND = {
  name: 'オゴリ',
  nameEn: 'OGORI',
  tagline: '社長のお米が、社員のご自宅へ。',
  description: '会社ごとのIDを発行して、社内の福利厚生をまるごとサポートするプラットフォーム。',
};

// 料金（1人あたり）— PDFより「月額1万円（税別）」
export const PRICING = {
  monthlyPerEmployee: 10000, // 税別・円
  taxRate: 0.1,
  currency: 'JPY',
  includes: [
    '導入費用',
    '従業員様への利用促進サポート',
    'お米／野菜の商品費用',
    '配送料',
  ],
};

// 配送ルール — PDFより「偶数月はお米／奇数月は野菜」
export const PRODUCTS = {
  rice: { type: 'rice', name: 'お米 5kg', emoji: '🍚', icon: '/assets/rice.png' },
  vegetable: { type: 'vegetable', name: '旬の野菜セット', emoji: '🥬', icon: '/assets/vegetable.svg' },
};

// ゆくゆく提供予定（PDF: オムツなど子育て世代向け）
export const UPCOMING_PRODUCTS = ['オムツ・子育て世代向け商品（提供予定）'];

// 導入期待効果（PDFの事例より）
export const EXPECTED_EFFECTS = [
  { key: 'seatRate', label: '採用イベントでの着座率', value: '1.7倍', note: '「お米がもらえる」というキャッチーさで着座率が向上' },
  { key: 'recruitCost', label: '採用費用', value: '大幅削減', note: '採用単価・広告費の圧縮に貢献' },
  { key: 'retention', label: '離職率', value: '低下', note: 'ご家族にも届く安心感で定着率アップ' },
];

// セッション有効期限（日）
export const SESSION_TTL_DAYS = 14;

// 一括で自動生成する配送スケジュールの月数
export const SCHEDULE_MONTHS = 12;

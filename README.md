# オゴリ (OGORI) 🦍

**社長のお米が、社員のご自宅へ。**

会社ごとに **会社ID** を発行し、社内の **福利厚生** をまるごとサポートする Web プラットフォームです。
「毎日使う消耗品（お米・旬の野菜）を社員のご家庭に直接お届けする」福利厚生サービスの管理システムとして、
企業の登録・社員管理・配送スケジュール管理・社員向けポータルを提供します。

> 元となった企画: 「社長のお米が直接家に届く福利厚生サービス」
> 偶数月はお米、奇数月は旬の野菜を、1人あたり月額1万円（税別）でお届け。青いゴリラのキャラクター「ゴリ」がナビゲートします。

---

## 特長

- **会社IDの発行** — 企業が登録すると `OGORI-XXXXXX` 形式の一意な会社IDを即時発行。社員はこのIDでログインします。
- **企業管理コンソール** (`/admin`) — 社員の登録・編集・削除、初期PINの発行/再発行、稼働状況の管理、月額費用の自動計算、配送ステータス管理。
- **社員ポータル** (`/employee`) — 会社ID＋社員コード＋PINでログイン。お届け先住所の登録、12ヶ月分の配送スケジュール確認、PIN変更。
- **配送ロジック** — 偶数月はお米5kg、奇数月は旬の野菜セット。社員登録時に12ヶ月分の予定を自動生成。
- **料金の自動計算** — 稼働中の社員数 × 月額1万円（税込11,000円）を月額・年間で表示。停止中の社員は除外。
- **マルチテナント分離** — 各社のデータは会社IDで完全に分離。他社の社員は参照・操作不可。
- **総当たり対策** — ログインはアカウント単位・IP単位で失敗回数を監視し、閾値超過でロックアウト（429）。初期PINは8桁。
- **キャラクター内蔵** — 企画資料の青いゴリラ「ゴリ」とお米・野菜のイラストを全面採用。

## オンラインプレビュー（GitHub Pages）

サーバー不要で全画面をブラウザ上でお試しいただけます。

- 公開URL: **https://playmark0227-svg.github.io/ogori/**
- 初回のみ、リポジトリの **Settings → Pages** で
  **「Deploy from a branch」→ Branch: `gh-pages` / `(root)`** を選択して保存してください。
  （GitHub のセキュリティ上、Pages の有効化はオーナー本人の操作が必要です）
- 有効化後は `.github/workflows/pages.yml` が `public/` を `gh-pages` ブランチへ
  自動反映するため、push のたびにプレビューが更新されます。

プレビュー（静的）モードでは、バックエンドの代わりに **ブラウザ内のデータ
（localStorage）** で同じAPIを再現します（`public/js/static-backend.js`）。

- 会社の新規登録・会社ID発行、社員の追加、配送スケジュール、社員ログインまで
  すべてブラウザだけで動作します（データはご利用の端末に保存）。
- 各ログイン画面に「デモ会社でログイン」ボタンを用意。すぐに操作を試せます。
- 同じ画面ファイルは Node サーバー配下では実バックエンドに接続します
  （`github.io` ホスト時のみ自動的に静的モードへ切替）。

## 技術スタック

**依存パッケージ ゼロ。** Node.js 22 の標準機能のみで動作します。

- ランタイム: **Node.js v22.5.0 以上**
- HTTP サーバー: `node:http`（フレームワーク不使用の軽量ルーター）
- データベース: `node:sqlite`（組み込みSQLite・実験的機能）
- 認証: `node:crypto`（scrypt によるパスワード/PINハッシュ、セッショントークン）
- フロントエンド: 素の HTML / CSS / ES Modules（ビルド不要）

## セットアップと起動

```bash
# 起動（http://localhost:3000）
npm start

# デモデータ付きで起動（会社1社＋社員5名を投入し、ログイン情報を表示）
OGORI_SEED=1 npm start

# 開発モード（ファイル変更で自動再起動）
npm run dev

# デモデータのみ投入
npm run seed

# テスト（API統合テスト・19件）
npm test
```

起動後のURL:

| 画面 | URL |
| --- | --- |
| ランディングページ | http://localhost:3000/ |
| 企業管理コンソール | http://localhost:3000/admin |
| 社員ポータル | http://localhost:3000/employee |

### デモアカウント（`OGORI_SEED=1` で起動時）

- **企業管理者**: `admin@demo-ogori.jp` / パスワード `gorigori2026`
- **社員**: 起動ログに表示される「会社ID・社員コード・PIN」でログイン

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `HOST` | `0.0.0.0` | 待ち受けホスト |
| `OGORI_DB` | `data/ogori.db` | SQLiteファイルのパス（`:memory:` で揮発） |
| `OGORI_SEED` | — | `1` のとき起動時にデモデータを投入 |
| `OGORI_SECURE_COOKIES` | — | `1`（または `NODE_ENV=production`）でセッションCookieに `Secure` 付与 |
| `OGORI_TRUST_PROXY` | — | `1` でレート制限のIP判定に `X-Forwarded-For` を使用 |

## API 概要

すべて JSON。認証は HttpOnly Cookie（`Authorization: Bearer <token>` も可）。

### 公開
- `GET /api/health` — ヘルスチェック
- `GET /api/plan` — 料金・配送ルール・キャラクター等の公開情報

### 企業（管理者）
- `POST /api/companies/register` — 会社登録＋会社ID発行＋ログイン
- `POST /api/companies/login` / `POST /api/companies/logout`
- `GET  /api/companies/me` — 会社情報＋統計＋料金
- `GET  /api/employees` / `POST /api/employees`
- `PATCH /api/employees/:id` / `DELETE /api/employees/:id`
- `POST /api/employees/:id/reset-pin` — PIN再発行
- `GET  /api/deliveries` / `PATCH /api/deliveries/:id` — 配送状態更新

### 社員ポータル
- `POST /api/employee/login`（会社ID＋社員コード＋PIN） / `POST /api/employee/logout`
- `GET  /api/employee/me` — 自分の情報＋配送履歴
- `PUT  /api/employee/address` — お届け先の更新
- `PUT  /api/employee/pin` — PIN変更

## ディレクトリ構成

```
ogori/
├── server/
│   ├── index.js          # エントリポイント（HTTPサーバー起動）
│   ├── app.js            # ルーター定義とディスパッチ
│   ├── db.js             # SQLite初期化・スキーマ
│   ├── auth.js           # パスワード/PINハッシュ・セッション
│   ├── ids.js            # 会社ID・社員コード・PIN生成
│   ├── schedule.js       # 配送スケジュール・料金計算
│   ├── repo.js           # データアクセス層
│   ├── middleware.js     # 認可（requireAdmin / requireEmployee）
│   ├── validate.js       # 入力バリデーション
│   ├── serialize.js      # レスポンス整形（機密情報の除外）
│   ├── static.js         # 静的ファイル配信
│   ├── config.js         # 事業ルール・定数
│   ├── seed.js           # デモデータ
│   └── routes/           # 各APIハンドラ
├── public/               # フロントエンド（HTML/CSS/JS/画像）
│   ├── index.html, admin.html, employee.html, 404.html
│   ├── css/, js/
│   └── assets/           # キャラクター画像（ゴリ・お米・野菜）
└── test/api.test.js      # API統合テスト
```

## セキュリティ上の注意

本リポジトリは企画デモ用途です。実装済みの対策と、実運用での追加推奨事項は以下の通りです。

実装済み: scrypt によるハッシュ、HttpOnly Cookie セッション、マルチテナント分離、ログインのレート制限／ロックアウト、静的配信のパストラバーサル対策、レスポンスからの機密情報除外。

実運用での追加推奨:

- HTTPS 終端の前段配置＋ `OGORI_SECURE_COOKIES=1`（Cookie の `Secure` 属性）と HSTS
- リバースプロキシ配下では `OGORI_TRUST_PROXY=1` で正しいクライアントIPを判定
- 個人情報（住所等）の暗号化・アクセス監査
- `node:sqlite` は実験的機能のため、本番では安定版DBの利用も検討

---

© 2026 OGORI — デモ用アプリケーション。キャラクター及び企画は提供資料に基づきます。

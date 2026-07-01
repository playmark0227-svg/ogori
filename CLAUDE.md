# オゴリ (OGORI) — プロジェクトメモ

会社ごとにIDを発行して社内の福利厚生をサポートするプラットフォーム。
社長のお米・旬の野菜が社員のご自宅に届く（偶数月=お米/奇数月=野菜、1人 月額1万円税別）。
青いゴリラのキャラクター「ゴリ」を使用。

## 公開プレビュー（GitHub Pages）

- **サービス紹介（HP）**: https://playmark0227-svg.github.io/ogori/
- **アプリ入口**: https://playmark0227-svg.github.io/ogori/app/
  - 企業管理: https://playmark0227-svg.github.io/ogori/app/admin.html
  - 社員ポータル: https://playmark0227-svg.github.io/ogori/app/employee.html

## ユーザーの依頼（重要）

- **返信のたびに、上記の github.io リンクを必ず載せること。**（毎回）

## 構成メモ

- HP はトップ `/`、アプリ画面は `/app/` 以下（別URL）。
- フロントは1コードで2モード動作: Nodeサーバー配下=実API、github.io/file://=`public/js/static-backend.js`（localStorage）で動作。
- 静的公開は `gh-pages` ブランチ方式（`.github/workflows/pages.yml` が push ごとに `public/` を反映）。
  初回のみ Settings → Pages で「Deploy from a branch: gh-pages / (root)」の有効化が必要。
- 作業ブランチ: `claude/company-id-welfare-platform-lzu8ki`。
- テスト: `npm test`（APIテスト20件）。起動: `npm start`（デモデータ入りは `OGORI_SEED=1 npm start`）。

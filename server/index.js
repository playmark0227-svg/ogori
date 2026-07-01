// エントリポイント: DB初期化 → HTTPサーバー起動。
import { createServer } from 'node:http';
import { initDb } from './db.js';
import { purgeExpiredSessions } from './auth.js';
import { handleRequest } from './app.js';
import { maybeSeed } from './seed.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

initDb(process.env.OGORI_DB); // 省略時は data/ogori.db
purgeExpiredSessions();
maybeSeed(); // OGORI_SEED=1 のときだけデモデータを投入

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[ogori] リクエスト処理で致命的エラー:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'サーバーエラーが発生しました。' }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n🦍 オゴリ (OGORI) プラットフォームが起動しました`);
  console.log(`   → http://localhost:${PORT}\n`);
  console.log(`   ランディング : http://localhost:${PORT}/`);
  console.log(`   企業管理     : http://localhost:${PORT}/admin`);
  console.log(`   社員ポータル : http://localhost:${PORT}/employee\n`);
});

// グレースフルシャットダウン
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} を受信。サーバーを停止します。`);
    server.close(() => process.exit(0));
  });
}

// 静的ファイル配信（依存無し）。パストラバーサル対策込み。
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

// URLパス → 実ファイルのマッピング（拡張子なしのページは .html を補完）。
const PAGE_ALIASES = {
  '/': 'index.html',
  '/admin': 'admin.html',
  '/employee': 'employee.html',
};

export async function serveStatic(req, res, pathname) {
  let rel = PAGE_ALIASES[pathname] ?? pathname.replace(/^\/+/, '');
  if (rel === '' ) rel = 'index.html';

  // 正規化してPUBLIC_DIR外への脱出を防ぐ。
  const target = normalize(join(PUBLIC_DIR, rel));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return true;
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return false; // 見つからない → 呼び出し側で404など
  }
  if (info.isDirectory()) return false;

  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  const isImmutable = target.includes(`${'/'}assets${'/'}`);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': isImmutable ? 'public, max-age=86400' : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(target).pipe(res);
  return true;
}

# form-checker セットアップ・作業ガイド

## 概要

WordPress フォームプラグイン診断ツール。  
ユーザーがURLを入力すると、使用中のフォームプラグインとスパム対策の状況を解析し、
状態に応じたCTAへ誘導する。

**技術構成**
- バックエンド: Cloudflare Workers（TypeScript）
- フロントエンド: バニラJS（WordPress に `<script>` タグ1行で埋め込み）
- AI解析: Anthropic Claude API（`claude-haiku-4-5` ）
- APIキー: Worker の環境変数に保持。フロントには一切露出しない

---

## ファイル構成

```
form-checker/
├── SETUP.md                  このファイル
├── README.md                 概要・コマンドリファレンス
├── pages/
│   ├── form-checker.js       WordPress 埋め込みスクリプト（本体）
│   └── demo.html             ローカル動作確認用 HTML
└── worker/
    ├── src/index.ts          Cloudflare Worker 本体
    ├── wrangler.toml         Worker 設定
    ├── package.json
    └── tsconfig.json
```

---

## 初回セットアップ

### 前提

- Node.js 18 以上
- Wrangler CLI（`npm install -g wrangler` またはプロジェクトローカル）
- Cloudflare アカウント（無料プランで可）
- Anthropic API キー

### 手順

#### 1. VS Code でフォルダを開く

```
ファイル → フォルダを開く → /path/to/web-soudan.co.jp
```

または

```bash
code /path/to/web-soudan.co.jp
```

#### 2. Worker の依存パッケージをインストール

VS Code のターミナルで:

```bash
cd form-checker/worker
npm install
```

#### 3. Cloudflare にログイン

```bash
npx wrangler login
```

ブラウザが開くので Cloudflare アカウントで認証する。

#### 4. APIキーを登録（秘密変数）

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

プロンプトが出たら Anthropic API キーを貼り付けて Enter。  
**このキーは `.dev.vars` にのみ書き、git には絶対コミットしない。**

#### 5. Worker をデプロイ

```bash
npm run deploy
```

成功すると以下のような URL が表示される:

```
https://form-checker-api.YOUR_SUBDOMAIN.workers.dev
```

この URL をメモしておく。

#### 6. ALLOWED_ORIGIN を本番 URL に更新

`worker/wrangler.toml` を編集:

```toml
[vars]
ALLOWED_ORIGIN = "https://web-soudan.co.jp"  # ← 本番ドメインに変更
```

再デプロイ:

```bash
npm run deploy
```

---

## フロントエンドの設定

`pages/form-checker.js` の先頭にある2箇所を更新する。

### Worker URL

```js
const DEFAULT_WORKER_URL = "https://form-checker-api.YOUR_SUBDOMAIN.workers.dev";
//                                                   ↑ 実際のサブドメインに変更
```

### CTA URL（確定次第更新）

```js
const CTA = {
  consult:    "https://web-soudan.co.jp/contact/",          // 無料相談フォーム
  turnstile:  "https://web-soudan.co.jp/turnstile-addon/",  // Turnstileアドオン購入
  maintenance:"https://web-soudan.co.jp/maintenance/",       // 保守プラン案内
};
```

---

## WordPress への埋め込み

### 方法A: ページ・投稿のカスタムHTML

Gutenberg の「カスタムHTML」ブロックに貼り付け:

```html
<div id="form-checker-widget"></div>
<script src="https://web-soudan.co.jp/form-checker/form-checker.js"></script>
```

### 方法B: テンプレートファイルに直接記述

任意の `.php` テンプレートに:

```php
<div id="form-checker-widget"></div>
<script src="<?php echo get_template_directory_uri(); ?>/form-checker/form-checker.js"></script>
```

### Worker URL をページ単位で上書きする場合

```html
<div id="form-checker-widget"
     data-worker-url="https://form-checker-api.YOUR_SUBDOMAIN.workers.dev">
</div>
```

### `form-checker.js` の設置場所

WordPress テーマの `/form-checker/` ディレクトリに配置するか、  
メディアライブラリにアップロードするか、CDN 経由で配信する。

---

## ローカル開発

### 1. .dev.vars を作成（gitignore 済み）

```bash
# form-checker/worker/.dev.vars
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
ALLOWED_ORIGIN=http://localhost:8080
```

### 2. Worker をローカル起動

```bash
cd form-checker/worker
npm run dev
# → http://localhost:8787 で起動
```

### 3. demo.html を確認

`pages/demo.html` の `data-worker-url` を書き換え:

```html
<div id="form-checker-widget"
     data-worker-url="http://localhost:8787">
</div>
```

VS Code の Live Server 拡張、または任意の HTTP サーバーで `pages/demo.html` を開く。

```bash
# npx で簡易サーバーを立てる例
cd form-checker/pages
npx serve .
# → http://localhost:3000/demo.html
```

---

## CTA 出し分けロジック

| 検出状態 | 優先CTA | サブCTA |
|---|---|---|
| MW WP Form ＋ 古いバージョン | 無料相談（キャンペーン対象） | Turnstileアドオン / 保守プラン |
| MW WP Form ＋ スパム対策なし | 無料相談（キャンペーン対象） | Turnstileアドオン / 保守プラン |
| MW WP Form ＋ 最新・対策あり | Turnstileアドオン | 保守プラン |
| 他プラグイン（CF7 / WPForms 等）| 保守プラン | 無料相談 |
| フォーム未検出 | 無料相談 | — |

---

## バージョン管理（git）

```bash
# 現在の状態確認
git status

# 変更をコミット（例: CTA URLを更新した場合）
git add form-checker/pages/form-checker.js
git commit -m "fix: CTA URLを本番URLに更新"

# Worker URL を更新した場合
git add form-checker/pages/form-checker.js form-checker/worker/wrangler.toml
git commit -m "fix: Worker URLと本番ドメインを設定"
```

### .dev.vars は絶対にコミットしない

`.gitignore` に設定済みだが念のため確認:

```bash
git status  # .dev.vars が表示されないことを確認
```

---

## 今後の作業メモ（TODO）

- [ ] Worker URL を実際のサブドメインに書き換え
- [ ] CTA URL を確定次第 `form-checker.js` に反映
- [ ] `ALLOWED_ORIGIN` を本番ドメインに設定して再デプロイ
- [ ] WordPress に `form-checker.js` を設置・埋め込みコードを貼る
- [ ] ローカルで `demo.html` を使って動作確認
- [ ] Cloudflare の Rate Limiting を設定（Workers の設定画面から）
- [ ] アクセス数・エラー率を Cloudflare Analytics で確認

---

## トラブルシューティング

### `wrangler: command not found`

```bash
npm install -g wrangler
# または
npx wrangler ...
```

### CORS エラー（ブラウザコンソール）

`wrangler.toml` の `ALLOWED_ORIGIN` が実際のドメインと一致しているか確認。  
ローカル開発時は `http://localhost:3000` など実際のオリジンに合わせる。

### `Anthropic API error: 401`

Wrangler の secret が正しく登録されているか確認:

```bash
npx wrangler secret list
```

`ANTHROPIC_API_KEY` が表示されれば登録済み。  
表示されなければ `npx wrangler secret put ANTHROPIC_API_KEY` を再実行。

### 解析結果が「フォーム未検出」になる

- フォームが JavaScript で動的に描画されている場合は検出できないことがある
- フォームページのURL（一覧ページではなくフォームが実際にある個別ページ）を入力しているか確認


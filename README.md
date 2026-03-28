# form-checker

WordPress フォームプラグイン診断ツール  
web-soudan.co.jp への JS 埋め込み用 + Cloudflare Workers バックエンド

## 構成

```
form-checker/
├── worker/               Cloudflare Worker（APIキー保持・解析処理）
│   ├── wrangler.toml
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
└── pages/                フロントエンド
    ├── form-checker.js   埋め込みスクリプト
    └── demo.html         ローカル確認用
```

## 検出対象

| プラグイン | 検出シグナル |
|---|---|
| MW WP Form | `mw_wp_form` class, `/plugins/mw-wp-form/` |
| Contact Form 7 | `wpcf7`, `/plugins/contact-form-7/` |
| WPForms | `wpforms`, `/plugins/wpforms/` |
| Gravity Forms | `gform_`, `/plugins/gravityforms/` |
| Ninja Forms | `nf-form`, `/plugins/ninja-forms/` |
| formrun | `formrun.com`, `flexy-form` |

スパム対策: Cloudflare Turnstile / reCAPTCHA / hCaptcha / Akismet

## セットアップ

### 1. Worker のデプロイ

```bash
cd worker
npm install
npx wrangler secret put ANTHROPIC_API_KEY   # APIキーを登録
npm run deploy
```

デプロイ後に表示される Worker URL をメモする。

### 2. wrangler.toml の ALLOWED_ORIGIN を更新

```toml
[vars]
ALLOWED_ORIGIN = "https://web-soudan.co.jp"
```

本番URLに変更後、再度 `npm run deploy`。

### 3. フロントエンドのURLを書き換え

`pages/form-checker.js` の先頭:

```js
const DEFAULT_WORKER_URL = "https://form-checker-api.YOUR_SUBDOMAIN.workers.dev";
```

→ 実際の Worker URL に変更。

CTA URLも同ファイルの `CTA` オブジェクトで管理:

```js
const CTA = {
  consult:    "https://web-soudan.co.jp/contact/",
  turnstile:  "https://web-soudan.co.jp/turnstile-addon/",
  maintenance:"https://web-soudan.co.jp/maintenance/",
};
```

### 4. WordPress への埋め込み

投稿・固定ページのカスタムHTML、またはテーマの任意の場所に追加:

```html
<div id="form-checker-widget"></div>
<script src="https://web-soudan.co.jp/form-checker/form-checker.js"></script>
```

Worker URL をページ単位で上書きしたい場合は `data-worker-url` 属性を使用。

## ローカル開発

```bash
cd worker

# .dev.vars にAPIキーを記述（gitignore済み）
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars

npm run dev   # http://localhost:8787 で起動
```

`pages/demo.html` の `data-worker-url` を `http://localhost:8787` に変更してブラウザで確認。

## CTA ロジック

| 状態 | 表示CTA |
|---|---|
| MW WP Form 古いバージョン | 無料相談（優先）/ Turnstileアドオン / 保守プラン |
| MW WP Form スパム対策なし | 無料相談（優先）/ Turnstileアドオン / 保守プラン |
| MW WP Form 問題なし | Turnstileアドオン / 保守プラン |
| 他プラグイン検出 | 保守プラン / 無料相談 |
| 未検出 | 無料相談 |

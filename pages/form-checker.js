/**
 * form-checker.js
 * web-soudan.co.jp 埋め込み用スクリプト
 *
 * 使い方:
 *   <div id="form-checker-widget"></div>
 *   <script src="/form-checker/form-checker.js"></script>
 *
 * または data 属性で Worker URL を上書き可能:
 *   <div id="form-checker-widget" data-worker-url="https://your-worker.workers.dev"></div>
 */

(function () {
  "use strict";

  // ============================================================
  // 設定（デプロイ後に書き換え）
  // ============================================================
  const DEFAULT_WORKER_URL = "https://form-checker-api.YOUR_SUBDOMAIN.workers.dev";

  // CTA URL（確定次第書き換え）
  const CTA = {
    consult:    "https://web-soudan.co.jp/contact/",          // 無料相談フォーム
    turnstile:  "https://web-soudan.co.jp/turnstile-addon/",  // Turnstileアドオン購入
    maintenance:"https://web-soudan.co.jp/maintenance/",       // 保守プラン案内
  };

  // ============================================================
  // スタイル
  // ============================================================
  const CSS = `
    .fck-wrap { font-family: sans-serif; font-size: 15px; color: #2C2C30; line-height: 1.6; max-width: 640px; margin: 0 auto; }
    .fck-wrap * { box-sizing: border-box; }
    .fck-desc { font-size: 14px; color: #666; margin: 0 0 12px; }
    .fck-row { display: flex; gap: 8px; margin-bottom: 16px; }
    .fck-input { flex: 1; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 15px; transition: border-color .2s; }
    .fck-input:focus { outline: none; border-color: #d4547a; }
    .fck-btn { padding: 10px 20px; background: #d4547a; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s; }
    .fck-btn:hover { background: #b8406a; }
    .fck-btn:disabled { background: #ccc; cursor: not-allowed; }
    .fck-loading { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #666; padding: 8px 0; }
    .fck-spinner { width: 16px; height: 16px; border: 2px solid #ddd; border-top-color: #d4547a; border-radius: 50%; animation: fck-spin .7s linear infinite; flex-shrink: 0; }
    @keyframes fck-spin { to { transform: rotate(360deg); } }
    .fck-error { font-size: 14px; color: #c0392b; padding: 8px 0; }
    .fck-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
    .fck-card-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
    .fck-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; font-weight: 700; }
    .fck-icon-danger { background: #fce8e8; color: #c0392b; }
    .fck-icon-warn   { background: #fff4e0; color: #e67e22; }
    .fck-icon-ok     { background: #e8f5e9; color: #27ae60; }
    .fck-icon-none   { background: #f5f5f5; color: #999; }
    .fck-card-title { font-size: 15px; font-weight: 600; color: #2C2C30; margin: 0 0 2px; }
    .fck-card-sub { font-size: 13px; color: #666; margin: 0; }
    .fck-card-body { padding: 12px 16px; }
    .fck-detail { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
    .fck-detail:last-child { border-bottom: none; }
    .fck-detail-label { color: #888; }
    .fck-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .fck-badge-danger  { background: #fce8e8; color: #c0392b; }
    .fck-badge-warn    { background: #fff4e0; color: #e67e22; }
    .fck-badge-ok      { background: #e8f5e9; color: #27ae60; }
    .fck-badge-gray    { background: #f5f5f5; color: #888; }
    .fck-badge-info    { background: #e8f0fe; color: #1a73e8; }
    .fck-cta { padding: 12px 16px; background: #faf5f7; border-top: 1px solid #f0e0e6; display: flex; flex-direction: column; gap: 8px; }
    .fck-cta-label { font-size: 12px; color: #999; margin: 0 0 2px; }
    .fck-cta-btn { display: block; text-align: center; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background .15s, color .15s; }
    .fck-cta-primary { background: #d4547a; color: #fff; border: none; }
    .fck-cta-primary:hover { background: #b8406a; }
    .fck-cta-secondary { background: #fff; color: #2C2C30; border: 1px solid #ccc; }
    .fck-cta-secondary:hover { background: #f5f5f5; }
    .fck-note { font-size: 12px; color: #aaa; margin-top: 6px; }
    .fck-plugin-list { display: flex; flex-direction: column; gap: 8px; }
  `;

  // ============================================================
  // ユーティリティ
  // ============================================================
  function badge(text, type) {
    return `<span class="fck-badge fck-badge-${type}">${text}</span>`;
  }

  function pluginSeverity(plugin) {
    if (plugin.id === "mw_wp_form" && plugin.is_outdated) return "danger";
    if (plugin.id === "mw_wp_form") return "warn";
    return "info";
  }

  function buildPluginCard(plugin, spamProtection) {
    const severity = pluginSeverity(plugin);
    const iconMap = { danger: "!", warn: "△", ok: "✓", info: "i" };
    const iconClass = { danger: "fck-icon-danger", warn: "fck-icon-warn", ok: "fck-icon-ok", info: "fck-icon-none" };

    let title, sub;
    if (plugin.id === "mw_wp_form") {
      if (plugin.is_outdated) {
        title = "MW WP Form を使用中（要対応）";
        sub = "バージョンが古い可能性があります。早めのアップデートをご確認ください。";
      } else if (!spamProtection.detected) {
        title = "MW WP Form を使用中（スパム対策未確認）";
        sub = "スパム・迷惑メール対策が確認できませんでした。";
      } else {
        title = "MW WP Form を使用中";
        sub = "現時点で大きな問題は検出されませんでした。";
      }
    } else {
      title = `${plugin.name} を使用中`;
      sub = "フォームプラグインが検出されました。";
    }

    const versionBadge = plugin.version
      ? badge(plugin.version + (plugin.is_outdated ? "（古い）" : ""), plugin.is_outdated ? "danger" : "ok")
      : badge("不明", "gray");

    const confidenceBadge = badge(
      { high: "高", medium: "中", low: "低" }[plugin.confidence] ?? "中", "gray"
    );

    // CTA（MW WP Formのみ積極的に誘導）
    let ctaHtml = "";
    if (plugin.id === "mw_wp_form") {
      if (plugin.is_outdated || !spamProtection.detected) {
        ctaHtml = `
        <div class="fck-cta">
          <p class="fck-cta-label">このサイトのセキュリティが心配な方へ</p>
          <a class="fck-cta-btn fck-cta-primary" href="${CTA.consult}" target="_blank" rel="noopener">無料相談を申し込む（キャンペーン対象）</a>
          <a class="fck-cta-btn fck-cta-secondary" href="${CTA.turnstile}" target="_blank" rel="noopener">Turnstileアドオンで自己対応する</a>
          <a class="fck-cta-btn fck-cta-secondary" href="${CTA.maintenance}" target="_blank" rel="noopener">保守プランの詳細を見る</a>
        </div>`;
      } else {
        ctaHtml = `
        <div class="fck-cta">
          <p class="fck-cta-label">さらに安全にするために</p>
          <a class="fck-cta-btn fck-cta-secondary" href="${CTA.turnstile}" target="_blank" rel="noopener">Turnstileアドオンについて詳しく見る</a>
          <a class="fck-cta-btn fck-cta-secondary" href="${CTA.maintenance}" target="_blank" rel="noopener">保守プランの詳細を見る</a>
        </div>`;
      }
    } else {
      // MW以外のプラグイン検出時は保守プランのみ案内
      ctaHtml = `
      <div class="fck-cta">
        <p class="fck-cta-label">WordPress サイトの安全な運用をお手伝いします</p>
        <a class="fck-cta-btn fck-cta-secondary" href="${CTA.maintenance}" target="_blank" rel="noopener">保守プランの詳細を見る</a>
        <a class="fck-cta-btn fck-cta-secondary" href="${CTA.consult}" target="_blank" rel="noopener">無料相談を申し込む</a>
      </div>`;
    }

    return `
    <div class="fck-card">
      <div class="fck-card-head">
        <div class="fck-icon ${iconClass[severity]}">${iconMap[severity]}</div>
        <div>
          <p class="fck-card-title">${title}</p>
          <p class="fck-card-sub">${sub}</p>
        </div>
      </div>
      <div class="fck-card-body">
        <div class="fck-detail"><span class="fck-detail-label">バージョン</span>${versionBadge}</div>
        <div class="fck-detail"><span class="fck-detail-label">スパム対策</span>${
          spamProtection.detected
            ? badge(spamProtection.methods.join(" / "), "ok")
            : badge("未確認", "warn")
        }</div>
        <div class="fck-detail"><span class="fck-detail-label">検出精度</span>${confidenceBadge}</div>
      </div>
      ${ctaHtml}
    </div>`;
  }

  function buildNotDetectedCard() {
    return `
    <div class="fck-card">
      <div class="fck-card-head">
        <div class="fck-icon fck-icon-none">—</div>
        <div>
          <p class="fck-card-title">フォームプラグインは検出されませんでした</p>
          <p class="fck-card-sub">別のフォームサービス、または静的フォームが使用されている可能性があります。</p>
        </div>
      </div>
      <div class="fck-cta">
        <p class="fck-cta-label">WordPress サイトの運用でお困りの場合は</p>
        <a class="fck-cta-btn fck-cta-secondary" href="${CTA.consult}" target="_blank" rel="noopener">無料相談を申し込む</a>
      </div>
    </div>`;
  }

  // ============================================================
  // メイン処理
  // ============================================================
  function init(container) {
    const workerUrl = container.dataset.workerUrl || DEFAULT_WORKER_URL;

    // スタイル注入（一度だけ）
    if (!document.getElementById("fck-style")) {
      const style = document.createElement("style");
      style.id = "fck-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // HTML構造
    container.innerHTML = `
      <div class="fck-wrap">
        <p class="fck-desc">お問い合わせフォームが設置されているページのURLを入力してください。</p>
        <div class="fck-row">
          <input class="fck-input" id="fck-url" type="url" placeholder="https://example.com/contact/" />
          <button class="fck-btn" id="fck-submit">診断する</button>
        </div>
        <div id="fck-result"></div>
      </div>
    `;

    const input = container.querySelector("#fck-url");
    const btn = container.querySelector("#fck-submit");
    const resultArea = container.querySelector("#fck-result");

    async function runCheck() {
      const url = input.value.trim();
      if (!url || !url.startsWith("http")) {
        resultArea.innerHTML = `<p class="fck-error">有効なURLを入力してください。（https:// から始まるURL）</p>`;
        return;
      }

      resultArea.innerHTML = `
        <div class="fck-loading">
          <div class="fck-spinner"></div>
          ページを取得・解析中です...（10〜20秒かかる場合があります）
        </div>`;
      btn.disabled = true;

      try {
        const res = await fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        renderResult(data, resultArea);
      } catch (e) {
        resultArea.innerHTML = `<p class="fck-error">エラーが発生しました: ${e.message}</p>`;
      } finally {
        btn.disabled = false;
      }
    }

    btn.addEventListener("click", runCheck);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") runCheck(); });
  }

  function renderResult(data, resultArea) {
    const plugins = data.detected_plugins ?? [];
    const spam = data.spam_protection ?? { detected: false, methods: [] };

    let html = `<div class="fck-plugin-list">`;

    if (plugins.length === 0) {
      html += buildNotDetectedCard();
    } else {
      for (const plugin of plugins) {
        html += buildPluginCard(plugin, spam);
      }
    }

    html += `</div>`;
    if (data.notes) {
      html += `<p class="fck-note">※ ${data.notes}</p>`;
    }
    html += `<p class="fck-note">※ 外部からの解析のため、検出精度は100%ではありません。</p>`;

    resultArea.innerHTML = html;
  }

  // ============================================================
  // 自動マウント
  // ============================================================
  function mount() {
    const containers = document.querySelectorAll("#form-checker-widget, [data-form-checker]");
    containers.forEach((el) => init(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

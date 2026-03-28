/**
 * Form Checker API - Cloudflare Worker
 * APIキーはWorker環境変数に保持し、フロントには一切露出しない
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

// 検出対象プラグイン定義
const PLUGINS = [
  {
    id: "mw_wp_form",
    name: "MW WP Form",
    signals: ["mw_wp_form", "mw-wp-form", "/plugins/mw-wp-form/"],
    latestVersion: "5.0.5",
  },
  {
    id: "contact_form_7",
    name: "Contact Form 7",
    signals: ["wpcf7", "/plugins/contact-form-7/", "cf7"],
  },
  {
    id: "wpforms",
    name: "WPForms",
    signals: ["wpforms", "/plugins/wpforms/", "wpforms-field"],
  },
  {
    id: "gravity_forms",
    name: "Gravity Forms",
    signals: ["gform_", "/plugins/gravityforms/", "gf_form"],
  },
  {
    id: "ninja_forms",
    name: "Ninja Forms",
    signals: ["nf-form", "ninja-forms", "/plugins/ninja-forms/"],
  },
  {
    id: "formrun",
    name: "formrun",
    signals: ["formrun.com", "flexy-form"],
  },
];

const SPAM_SIGNALS = [
  { name: "Cloudflare Turnstile", signals: ["challenges.cloudflare.com/turnstile", "cf-turnstile"] },
  { name: "reCAPTCHA", signals: ["google.com/recaptcha", "grecaptcha"] },
  { name: "hCaptcha", signals: ["hcaptcha.com", "h-captcha"] },
  { name: "Akismet", signals: ["akismet"] },
];

// バージョン文字列を抽出 (ver=X.X.X パターン)
function extractVersion(html: string, pluginSlug: string): string | null {
  const re = new RegExp(`${pluginSlug}[^"']*[?&]ver=([\\d.]+)`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

// バージョン比較 (simple semver)
function isOutdated(current: string | null, latest: string | undefined): boolean | null {
  if (!current || !latest) return null;
  const parse = (v: string) => v.split(".").map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const ci = c[i] ?? 0;
    const li = l[i] ?? 0;
    if (ci < li) return true;
    if (ci > li) return false;
  }
  return false;
}

function buildCorsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  // 開発時はlocalhostも許可
  const allowed =
    origin === allowedOrigin ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
      ? origin
      : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

async function analyzeWithClaude(
  html: string,
  targetUrl: string,
  apiKey: string
): Promise<object> {
  const pluginSummary = PLUGINS.map(
    (p) => `${p.name}: シグナル=${p.signals.join(",")}`
  ).join("\n");

  const spamSummary = SPAM_SIGNALS.map(
    (s) => `${s.name}: ${s.signals.join(",")}`
  ).join("\n");

  const systemPrompt = `あなたはWordPressフォームプラグイン診断AIです。
与えられたHTMLソースを解析し、フォームプラグインの使用状況を判定してください。

検出対象プラグイン:
${pluginSummary}

スパム対策:
${spamSummary}

以下のJSON形式のみで返答してください。前後の説明文や\`\`\`は不要です:
{
  "detected_plugins": [
    {
      "id": "plugin_id",
      "name": "プラグイン名",
      "version": "X.X.X or null",
      "confidence": "high/medium/low"
    }
  ],
  "spam_protection": {
    "detected": true/false,
    "methods": ["Cloudflare Turnstile", "reCAPTCHA" など]
  },
  "notes": "補足事項（日本語・1〜2文）"
}`;

  const userPrompt = `URL: ${targetUrl}\n\nHTML（先頭8000文字）:\n${html.slice(0, 8000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((b) => b.type === "text")?.text ?? "";

  // JSONを安全にパース
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGIN);

    // プリフライト
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    let body: { url?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const targetUrl = body.url?.trim();
    if (!targetUrl || !targetUrl.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 対象サイトのHTMLを取得
    let html: string;
    try {
      const siteRes = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FormCheckerBot/1.0; +https://web-soudan.co.jp)",
        },
        redirect: "follow",
      });
      html = await siteRes.text();
    } catch {
      return new Response(
        JSON.stringify({ error: "サイトの取得に失敗しました。URLを確認してください。" }),
        { status: 422, headers: corsHeaders }
      );
    }

    // ローカルでの一次解析（Claude前のファーストパス）
    const firstPass: {
      id: string;
      name: string;
      version: string | null;
      latestVersion?: string;
    }[] = [];

    for (const plugin of PLUGINS) {
      const hit = plugin.signals.some((s) => html.includes(s));
      if (hit) {
        const version = extractVersion(html, plugin.id.replace(/_/g, "-"));
        firstPass.push({
          id: plugin.id,
          name: plugin.name,
          version,
          latestVersion: plugin.latestVersion,
        });
      }
    }

    // Claude APIで詳細解析
    let claudeResult: {
      detected_plugins?: { id: string; name: string; version: string | null; confidence: string }[];
      spam_protection?: { detected: boolean; methods: string[] };
      notes?: string;
    };
    try {
      claudeResult = (await analyzeWithClaude(
        html,
        targetUrl,
        env.ANTHROPIC_API_KEY
      )) as typeof claudeResult;
    } catch {
      // Claudeが失敗してもfirstPassの結果を使ってフォールバック
      claudeResult = {
        detected_plugins: firstPass.map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          confidence: "medium" as const,
        })),
        spam_protection: {
          detected: SPAM_SIGNALS.some((s) =>
            s.signals.some((sig) => html.includes(sig))
          ),
          methods: SPAM_SIGNALS.filter((s) =>
            s.signals.some((sig) => html.includes(sig))
          ).map((s) => s.name),
        },
        notes: "自動解析結果（簡易モード）",
      };
    }

    // バージョン情報をfirstPassの結果でエンリッチ
    const enrichedPlugins = (claudeResult.detected_plugins ?? []).map((p) => {
      const fp = firstPass.find((f) => f.id === p.id);
      const version = p.version ?? fp?.version ?? null;
      const plugin = PLUGINS.find((pl) => pl.id === p.id);
      const outdated = isOutdated(version, plugin?.latestVersion);
      return {
        ...p,
        version,
        is_outdated: outdated,
        latest_version: plugin?.latestVersion ?? null,
      };
    });

    const response = {
      url: targetUrl,
      detected_plugins: enrichedPlugins,
      spam_protection: claudeResult.spam_protection ?? { detected: false, methods: [] },
      notes: claudeResult.notes ?? "",
      analyzed_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  },
};

import type {
  BrowserResearchProvider,
  BrowserResearchResult,
  WebResearchSource
} from "../../application/ports/research-provider.js";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeResultUrl(raw: string, engine: "bing" | "duck"): string | null {
  let value = decodeHtml(raw.trim());
  try {
    if (engine === "duck") {
      const redirect = new URL(value, "https://html.duckduckgo.com");
      const nested = redirect.searchParams.get("uddg");
      if (nested) value = nested;
    } else {
      const redirect = new URL(value, "https://www.bing.com");
      if (
        redirect.hostname.toLowerCase().endsWith("bing.com") &&
        redirect.pathname.startsWith("/ck/")
      ) {
        const encoded = redirect.searchParams.get("u");
        if (encoded?.startsWith("a1")) {
          try {
            const decoded = Buffer.from(
              encoded.slice(2),
              "base64url"
            ).toString("utf8");
            if (/^https?:\/\//i.test(decoded)) value = decoded;
          } catch {
            // Keep original URL. Search-engine URLs are filtered later.
          }
        }
      }
    }
    const url = new URL(value);
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function blockedSearchHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "bing.com" ||
    host.endsWith(".bing.com") ||
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host === "duckduckgo.com" ||
    host.endsWith(".duckduckgo.com")
  );
}

function unsafeOrAdultHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return [
    "pornhub.",
    "xvideos.",
    "xnxx.",
    "xhamster.",
    "redtube.",
    "youporn.",
    "onlyfans.",
    "rule34.",
    "brazzers."
  ].some((token) => host.includes(token));
}

function classifySource(query: string, url: string): WebResearchSource["sourceType"] {
  const q = query.toLowerCase();
  const host = new URL(url).hostname.toLowerCase();
  if (/官网|官方网站|official|说明书|manual|support/.test(q)) {
    const generic = new Set([
      "official",
      "manual",
      "support",
      "product",
      "review",
      "usage",
      "guide"
    ]);
    const identityTokens = (q.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [])
      .filter((token) => !generic.has(token));
    if (identityTokens.some((token) => host.includes(token))) {
      return "OFFICIAL";
    }
    return "INDUSTRY";
  }
  if (/竞品|竞争|competitor|对比|comparison/.test(q)) return "COMPETITOR";
  if (/趋势|trend|市场|行业|industry/.test(q)) return "TREND";
  if (
    /douyin\.com|tiktok\.com|youtube\.com|youtu\.be|bilibili\.com|xiaohongshu\.com/.test(
      host
    )
  ) {
    return "PLATFORM";
  }
  if (
    /amazon\.|jd\.com|tmall\.com|taobao\.com|pinduoduo\.com|aliexpress\.|walmart\.|bestbuy\./.test(
      host
    )
  ) {
    return "PUBLIC_PRODUCT";
  }
  if (/review|评测|tech|news|lab|测评/.test(q + " " + host)) return "INDUSTRY";
  return "PUBLIC_PRODUCT";
}

function extractBing(html: string): string[] {
  const scoped = [...html.matchAll(/<li[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
    .map((item) => item[1] ?? "")
    .join("\n");
  const source = scoped || html;
  return [...source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((item) => normalizeResultUrl(item[1] ?? "", "bing"))
    .filter((item): item is string => Boolean(item));
}

function extractDuck(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((item) => normalizeResultUrl(item[1] ?? "", "duck"))
    .filter((item): item is string => Boolean(item));
}

export class PublicSearchResearchProvider implements BrowserResearchProvider {
  readonly id = "public-search";

  constructor(
    private readonly options: {
      fetcher?: typeof fetch;
      bingBaseUrl?: string;
      duckBaseUrl?: string;
      maxQueries?: number;
      maxResultsPerQuery?: number;
      maxTotalResults?: number;
      timeoutMs?: number;
    } = {}
  ) {}

  private async search(
    query: string,
    engine: "bing" | "duck"
  ): Promise<string[]> {
    const fetcher = this.options.fetcher ?? fetch;
    const base =
      engine === "bing"
        ? this.options.bingBaseUrl ?? "https://www.bing.com/search"
        : this.options.duckBaseUrl ?? "https://html.duckduckgo.com/html/";
    const url = new URL(base);
    url.searchParams.set("q", query);
    if (engine === "bing") url.searchParams.set("setlang", "zh-Hans");
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 15_000
    );
    try {
      const response = await fetcher(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
          "user-agent": BROWSER_UA
        }
      });
      if (!response.ok) return [];
      const html = await response.text();
      return engine === "bing" ? extractBing(html) : extractDuck(html);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async discover(input: {
    projectId: string;
    goal: string;
    queries: string[];
    resumeToken?: string;
  }): Promise<BrowserResearchResult> {
    const queries = [...new Set(input.queries.map((item) => item.trim()).filter(Boolean))].slice(
      0,
      this.options.maxQueries ?? 8
    );
    const maxEach = this.options.maxResultsPerQuery ?? 3;
    const maxTotal = this.options.maxTotalResults ?? 12;
    const seen = new Set<string>();
    const sources: WebResearchSource[] = [];

    for (const query of queries) {
      let urls = await this.search(query, "duck");
      if (!urls.length) urls = await this.search(query, "bing");
      for (const candidate of urls.slice(0, maxEach)) {
        if (sources.length >= maxTotal) break;
        let parsed: URL;
        try {
          parsed = new URL(candidate);
        } catch {
          continue;
        }
        if (
          blockedSearchHost(parsed.hostname) ||
          unsafeOrAdultHost(parsed.hostname)
        ) {
          continue;
        }
        const key = parsed.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({
          url: key,
          sourceType: classifySource(query, key)
        });
      }
      if (sources.length >= maxTotal) break;
    }

    if (!sources.length) {
      return {
        status: "BLOCKED",
        blockerCode: "BROWSER_PROVIDER_ERROR",
        message: "公开搜索暂时没有发现可用来源。",
        requiredUserAction:
          "检查网络或调整研究关键词；如果目标平台需要登录，可连接外部 Playwright Research Provider 后继续。",
        browserState: { provider: this.id }
      };
    }

    return {
      status: "READY",
      sources,
      browserState: { provider: this.id }
    };
  }
}

export class HybridBrowserResearchProvider implements BrowserResearchProvider {
  readonly id = "hybrid-browser-research";

  constructor(
    private readonly external: BrowserResearchProvider,
    private readonly publicSearch: BrowserResearchProvider =
      new PublicSearchResearchProvider()
  ) {}

  async discover(input: {
    projectId: string;
    goal: string;
    queries: string[];
    resumeToken?: string;
  }): Promise<BrowserResearchResult> {
    const external = await this.external.discover(input);
    if (
      external.status === "READY" ||
      (external.status === "BLOCKED" &&
        external.blockerCode !== "BROWSER_PROVIDER_NOT_CONFIGURED")
    ) {
      return external;
    }
    return this.publicSearch.discover(input);
  }
}

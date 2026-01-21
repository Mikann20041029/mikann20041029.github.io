import os, json, re, shutil, datetime, urllib.request, sys
from urllib.parse import quote_plus

ROOT = os.getcwd()

def utc_now():
    return datetime.datetime.utcnow()

def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, indent=2)
    json.loads(s)  # validate
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)

def http_get_json(url, headers=None):
    h = {
        "User-Agent": "Mozilla/5.0 (compatible; mikann-autogen/1.0; +https://mikann20041029.github.io/)",
        "Accept": "application/json,text/plain,*/*",
    }
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        try:
            return json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            head = raw[:300].decode("utf-8", errors="replace")
            raise RuntimeError(f"Non-JSON response from {url}: {head}")

def pick_topic():
    topics_path = os.path.join(ROOT, "automation", "system", "topics.json")
    topics = read_json(topics_path, {
        "topics": [
            {"key":"compress-media", "title":"容量を減らしたい（画像/動画/音声）", "query":"mp4 compress file size reduce image compress jpg png webp", "tag":"media"}
        ]
    })
    return topics["topics"][0]

def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+","-", s).strip("-")
    return s[:48] or "site"

def unique_slug(base):
    slug = base
    i = 2
    while os.path.exists(os.path.join(ROOT, slug)) or os.path.exists(os.path.join(ROOT, "docs", slug)):
        slug = f"{base}-{i}"
        i += 1
    return slug

def collect_github(query, days=30, limit=12):
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return []
    since = (utc_now() - datetime.timedelta(days=days)).date().isoformat()
    q = f"{query} created:>={since}"
    url = f"https://api.github.com/search/issues?q={quote_plus(q)}&sort=created&order=desc&per_page={min(limit, 30)}"
    j = http_get_json(url, headers={"Authorization": f"Bearer {token}"})
    out=[]
    for it in j.get("items", []):
        out.append({"source":"GitHub","title":it.get("title",""),"url":it.get("html_url",""),"created_at":it.get("created_at","")})
    return out

def collect_stackoverflow(query, days=30, limit=12):
    fromdate = int((utc_now() - datetime.timedelta(days=days)).timestamp())
    url = ("https://api.stackexchange.com/2.3/search/advanced"
           f"?order=desc&sort=creation&site=stackoverflow&pagesize={min(limit, 20)}"
           f"&fromdate={fromdate}&q={quote_plus(query)}")
    j = http_get_json(url, headers={"User-Agent":"mikann-autogen"})
    out=[]
    for it in j.get("items", []):
        out.append({"source":"StackOverflow","title":it.get("title",""),"url":it.get("link",""),
                    "created_at": datetime.datetime.utcfromtimestamp(it.get("creation_date",0)).isoformat()+"Z"})
    return out

def collect_reddit(query, days=30, limit=12):
    # Reddit is often 429/403 in CI; keep it but tolerate failures.
    url = f"https://www.reddit.com/search.json?q={quote_plus(query)}&sort=new&t=month&limit={min(limit, 25)}"
    j = http_get_json(url, headers={"User-Agent":"Mozilla/5.0 (mikann-autogen)"})
    out=[]
    cutoff = utc_now().timestamp() - days*86400
    for ch in (j.get("data",{}).get("children",[]) or []):
        d = ch.get("data",{})
        created = d.get("created_utc",0) or 0
        if created and created < cutoff:
            continue
        out.append({"source":"Reddit","title":d.get("title",""),
                    "url":"https://www.reddit.com"+(d.get("permalink","") or ""),
                    "created_at": datetime.datetime.utcfromtimestamp(created).isoformat()+"Z"})
    return out

def detect_lang(text):
    if not text:
        return "en"
    ascii_ratio = sum(1 for c in text if ord(c) < 128) / max(1,len(text))
    return "en" if ascii_ratio > 0.85 else "ja"

def make_reply(item, site_url):
    lang = detect_lang(item.get("title",""))
    if lang == "en":
        return (f"I found a page that tackles this exact family of issues (with steps + a small tool):\n"
                f"{site_url}\n"
                f"If it helps, skim the 1-minute conclusion first.")
    return (f"同じ系統の困りごとをまとめて解決するページを作りました（読み物＋ミニツール）。\n"
            f"{site_url}\n"
            f"まずは「1分で分かる対処方針」だけ見るのが早いです。")

def safe_collect(name, fn):
    try:
        items = fn()
        print(f"[collect:{name}] ok items={len(items)}")
        return items
    except Exception as e:
        print(f"[collect:{name}] FAIL {e}", file=sys.stderr)
        return []

def fallback_items_for(topic_key):
    # 最低限「参考URL 10本」を確保してサイト生成を止めない
    if topic_key == "compress-media":
        urls = [
            ("FFmpeg", "FFmpeg Documentation", "https://ffmpeg.org/documentation.html"),
            ("FFmpeg", "H.264 Encoding Guide", "https://trac.ffmpeg.org/wiki/Encode/H.264"),
            ("FFmpeg", "H.265 Encoding Guide", "https://trac.ffmpeg.org/wiki/Encode/H.265"),
            ("Mozilla", "Image optimization", "https://developer.mozilla.org/en-US/docs/Learn/Performance/Multimedia"),
            ("Google", "WebP docs", "https://developers.google.com/speed/webp"),
            ("Google", "AVIF overview", "https://developers.google.com/speed/webp/docs/avif"),
            ("StackExchange", "StackExchange API docs", "https://api.stackexchange.com/docs"),
            ("Reddit", "Reddit API docs", "https://www.reddit.com/dev/api/"),
            ("GitHub", "GitHub Search API docs", "https://docs.github.com/en/rest/search/search"),
            ("MDN", "Media formats guide", "https://developer.mozilla.org/en-US/docs/Web/Media/Formats"),
        ]
    else:
        urls = [
            ("GitHub", "GitHub Search API docs", "https://docs.github.com/en/rest/search/search"),
            ("StackExchange", "StackExchange API docs", "https://api.stackexchange.com/docs"),
            ("Reddit", "Reddit API docs", "https://www.reddit.com/dev/api/"),
            ("MDN", "Web Docs", "https://developer.mozilla.org/"),
            ("Wikipedia", "Troubleshooting", "https://en.wikipedia.org/wiki/Troubleshooting"),
            ("Wikipedia", "Software bug", "https://en.wikipedia.org/wiki/Software_bug"),
            ("OWASP", "Top 10", "https://owasp.org/www-project-top-ten/"),
            ("GitHub", "Actions docs", "https://docs.github.com/en/actions"),
            ("Google", "Search Central", "https://developers.google.com/search"),
            ("Cloudflare", "Learning Center", "https://www.cloudflare.com/learning/"),
        ]

    out=[]
    now = utc_now().isoformat()+"Z"
    for src, title, url in urls:
        out.append({"source":src, "title":title, "url":url, "created_at":now})
    return out

def build_site(slug, topic, items):
    tpl = os.path.join(ROOT, "automation", "template-site")
    dst = os.path.join(ROOT, slug)
    shutil.copytree(tpl, dst)

    docs_root = os.path.join(ROOT, "docs")
    if os.path.isdir(docs_root):
        docs_dst = os.path.join(docs_root, slug)
        if not os.path.exists(docs_dst):
            shutil.copytree(tpl, docs_dst)

    site_url = f"https://mikann20041029.github.io/{slug}/"
    problem_summaries = [f"[{it['source']}] {it['title']}" for it in items]
    refs = [{"url": it["url"], "title": f"{it['source']}: {it['title']}"} for it in items]

    base_data = read_json(os.path.join(tpl, "assets", "data.json"), {})
    base_data.update({
        "slug": slug,
        "title": topic["title"],
        "desc": "直近の投稿収集＋フォールバック参照を元に、読み物＋ツールでまとめて解決",
        "badge": "自動生成（収集失敗時はフォールバック）",
        "topic": topic["key"],
        "tags": ["auto", topic.get("tag","")],
        "problem_summaries": problem_summaries[:20],
        "refs": refs[:30],
    })
    write_json(os.path.join(dst, "assets", "data.json"), base_data)
    if os.path.isdir(docs_root):
        write_json(os.path.join(docs_root, slug, "assets", "data.json"), base_data)

    return site_url

def append_sites_json(slug, title, desc, tag):
    path = os.path.join(ROOT, "hub", "assets", "sites.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            arr = json.load(f)
        if not isinstance(arr, list):
            raise RuntimeError("hub/assets/sites.json is not a JSON array")
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        arr = []

    arr.append({"slug":slug, "title":title[:36], "desc":desc[:80], "tags":tag})
    s = json.dumps(arr, ensure_ascii=False, indent=2)
    json.loads(s)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)

def main():
    topic = pick_topic()
    base = "auto-" + slugify(topic["key"]) + "-" + utc_now().strftime("%Y%m%d")
    slug = unique_slug(base)

    items = []
    items += safe_collect("github", lambda: collect_github(topic["query"], days=30, limit=12))
    items += safe_collect("so", lambda: collect_stackoverflow(topic["query"], days=30, limit=12))
    items += safe_collect("reddit", lambda: collect_reddit(topic["query"], days=30, limit=12))

    seen=set(); uniq=[]
    for it in items:
        u = it.get("url","")
        if not u or u in seen:
            continue
        seen.add(u); uniq.append(it)

    # If we have too few, pad with fallback refs so the workflow never dies.
    if len(uniq) < 10:
        pad = fallback_items_for(topic["key"])
        for it in pad:
            u = it.get("url","")
            if u and u not in seen:
                seen.add(u); uniq.append(it)

    uniq = uniq[:20]

    site_url = build_site(slug, topic, uniq)
    append_sites_json(slug, topic["title"], "直近の収集＋フォールバック参照でまとめ（読み物＋ツール）", topic.get("tag","tool"))

    lines=[]
    lines.append(f"NEW SITE: {site_url}")
    lines.append("")
    lines.append("SOURCES (up to 20):")
    for it in uniq:
        lines.append(f"- {it['url']}")
    lines.append("")
    lines.append("REPLY DRAFTS:")
    for it in uniq:
        lines.append("")
        lines.append(f"URL: {it['url']}")
        lines.append(make_reply(it, site_url))

    out_path = os.path.join(ROOT, "automation", "out", "notify.md")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("OK slug=", slug)
    print("OK site_url=", site_url)
    print("OK notify=", out_path)

if __name__ == "__main__":
    main()
param(
  [string]$BaseSlug = "qt",
  [string]$OutDir   = "autogen",
  [int]$MaxCandidates = 40,
  [int]$MaxSources = 3
)

$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

function Slugify([string]$s){
  $s = ($s ?? "").ToLowerInvariant()
  $s = [regex]::Replace($s, "[^a-z0-9]+", "-").Trim("-")
  if([string]::IsNullOrWhiteSpace($s)){ $s = "topic" }
  if($s.Length -gt 60){ $s = $s.Substring(0,60).Trim("-") }
  return $s
}

function Strip-Html([string]$html){
  if([string]::IsNullOrWhiteSpace($html)){ return "" }
  $t = [regex]::Replace($html, "<script[\s\S]*?</script>", " ")
  $t = [regex]::Replace($t, "<style[\s\S]*?</style>", " ")
  $t = [regex]::Replace($t, "<[^>]+>", " ")
  $t = [regex]::Replace($t, "\s+", " ").Trim()
  return $t
}

function Safe-Get([string]$url, [hashtable]$headers=$null){
  try{
    return Invoke-WebRequest -Uri $url -Headers $headers -TimeoutSec 20 -MaximumRedirection 3 -UseBasicParsing
  } catch {
    return $null
  }
}

function Get-HN-Candidates {
  $cands = @()
  $top = Invoke-RestMethod "https://hacker-news.firebaseio.com/v0/topstories.json"
  $ids = $top | Select-Object -First 30
  $rank = 0
  foreach($id in $ids){
    $rank++
    $it = Invoke-RestMethod "https://hacker-news.firebaseio.com/v0/item/$id.json"
    if(-not $it.title){ continue }
    $u = $it.url
    if([string]::IsNullOrWhiteSpace($u)){ $u = "https://news.ycombinator.com/item?id=$id" }
    $score = [int]($it.score ?? 0) + [int](500 - ($rank*10))
    $cands += [pscustomobject]@{ title=$it.title; url=$u; source="HN"; score=$score }
  }
  return $cands
}

function Get-Reddit-Candidates {
  $ua = "mikann20041029-sitegen/1.0"
  $hdr = @{ "User-Agent" = $ua }
  $subs = @("technology","artificial","productivity","Entrepreneur","SideProject")
  $cands = @()
  foreach($s in $subs){
    $j = $null
    try{
      $j = Invoke-RestMethod -Headers $hdr -Uri "https://www.reddit.com/r/$s/hot.json?limit=10"
    } catch { $j = $null }
    if(-not $j){ continue }
    foreach($p in $j.data.children){
      $d = $p.data
      if(-not $d.title){ continue }
      $u = "https://www.reddit.com" + $d.permalink
      $score = [int]($d.ups ?? 0) + ([int]($d.num_comments ?? 0) * 2)
      $cands += [pscustomobject]@{ title=$d.title; url=$u; source="Reddit"; score=$score }
    }
  }
  return $cands
}

function Pick-Topic($cands){
  $blocked = @("porn","sex","nsfw","gore","weapon","buy drugs")
  $used = @{}
  $dirs = @()
  if(Test-Path $OutDir){
    $dirs = Get-ChildItem $OutDir -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
  }
  foreach($d in $dirs){ $used[$d] = $true }

  $sorted = $cands |
    Where-Object { $_.title } |
    Sort-Object score -Descending

  foreach($c in $sorted){
    $t = $c.title.ToLowerInvariant()
    $bad = $false
    foreach($b in $blocked){ if($t -match [regex]::Escape($b)){ $bad = $true; break } }
    if($bad){ continue }
    return $c
  }
  return $null
}

function Get-SourceSnippets([string[]]$urls){
  $snips = @()
  foreach($u in $urls | Select-Object -Unique | Select-Object -First $MaxSources){
    $res = Safe-Get $u
    if(-not $res){ 
      $snips += [pscustomobject]@{ url=$u; title=""; desc=""; text="" }
      continue
    }
    $html = $res.Content
    $title = ""
    if($html -match "<title[^>]*>([\s\S]*?)</title>"){ $title = (Strip-Html $matches[1]) }
    $desc = ""
    if($html -match '<meta\s+name="description"\s+content="([^"]+)"'){ $desc = $matches[1] }
    $text = Strip-Html ($html.Substring(0, [Math]::Min($html.Length, 20000)))
    if($text.Length -gt 900){ $text = $text.Substring(0,900) }
    $snips += [pscustomobject]@{ url=$u; title=$title; desc=$desc; text=$text }
  }
  return $snips
}

function Call-OpenAI($topicTitle, $topicUrl, $snips){
  $apiKey = $env:OPENAI_API_KEY
  if([string]::IsNullOrWhiteSpace($apiKey)){ return $null }

  $model = $env:OPENAI_MODEL
  if([string]::IsNullOrWhiteSpace($model)){ $model = "gpt-5-mini" }

  $maxOut = 900
  if($env:OPENAI_MAX_OUTPUT_TOKENS){ $maxOut = [int]$env:OPENAI_MAX_OUTPUT_TOKENS }

  $snipText = ($snips | ForEach-Object {
    @"
URL: $($_.url)
TITLE: $($_.title)
DESC: $($_.desc)
TEXT: $($_.text)

"@
  }) -join "`n"

  $system = @"
You write concise, factual pages from provided snippets only.
Rules:
- Use ONLY the supplied snippets/URLs as factual ground truth.
- If a detail is not present, say it is not confirmed.
- Output MUST be valid JSON and nothing else.
Schema:
{
  "title": "string",
  "description": "string",
  "sections": [{"h":"string","p":"string"}],
  "faq": [{"q":"string","a":"string"}],
  "tags": ["string"],
  "sources": [{"label":"string","url":"string"}]
}
Keep it short: 5 sections max, 4 FAQ max.
"@

  $user = @"
TOPIC: $topicTitle
TOPIC_URL: $topicUrl

SNIPPETS:
$snipText
"@

  $body = @{
    model = $model
    input = @(
      @{ role="system"; content=$system },
      @{ role="user"; content=$user }
    )
    max_output_tokens = $maxOut
  } | ConvertTo-Json -Depth 10

  $hdr = @{ "Authorization"="Bearer $apiKey"; "Content-Type"="application/json" }

  try{
    $r = Invoke-RestMethod -Method Post -Uri "https://api.openai.com/v1/responses" -Headers $hdr -Body $body
    # try common shapes
    $txt = $null
    if($r.output -and $r.output[0].content -and $r.output[0].content[0].text){ $txt = $r.output[0].content[0].text }
    if(-not $txt -and $r.output_text){ $txt = $r.output_text }
    if([string]::IsNullOrWhiteSpace($txt)){ return $null }

    # extract first JSON object defensively
    $m = [regex]::Match($txt, "\{[\s\S]*\}")
    if(-not $m.Success){ return $null }
    return ($m.Value | ConvertFrom-Json)
  } catch {
    return $null
  }
}

# --- MAIN ---
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutDir "assets") -Force | Out-Null

# candidates (free public sources)
$cands = @()
$cands += Get-HN-Candidates
$cands += Get-Reddit-Candidates
$cands = $cands | Sort-Object score -Descending | Select-Object -First $MaxCandidates

$pick = Pick-Topic $cands
if(-not $pick){ throw "No topic picked (all sources failed?)" }

$ymd = (Get-Date).ToString("yyyy-MM-dd")
$topicSlug = Slugify $pick.title
$slug = "{0}-{1}-{2}" -f $BaseSlug, $ymd, $topicSlug

# unique folder
$final = $slug
$i=2
while(Test-Path (Join-Path $OutDir $final)){
  $final = "$slug-$i"
  $i++
}

$postDir = Join-Path $OutDir $final
New-Item -ItemType Directory -Path (Join-Path $postDir "assets") -Force | Out-Null

# gather snippets (use the topic URL only; keep it cheap)
$snips = Get-SourceSnippets @($pick.url)

# AI generate (optional)
$data = Call-OpenAI $pick.title $pick.url $snips
if(-not $data){
  $data = [pscustomobject]@{
    title = "Quick Trend Guide: " + $pick.title
    description = "Auto-generated guide page (AI disabled or failed)."
    sections = @(
      @{ h="What is this?"; p="This page is generated daily from public trend sources. AI content is optional and depends on a configured API key." },
      @{ h="Why it matters"; p="If this topic keeps trending, it may impact products, creators, or users depending on the context." }
    )
    faq = @(
      @{ q="Where do topics come from?"; a="Public trend lists (HN/Reddit) gathered by GitHub Actions." }
    )
    tags = @("trend","daily")
    sources = @(
      @{ label=$pick.source; url=$pick.url }
    )
  }
}

# render HTML with fixed template
$tags = ($data.tags | Select-Object -First 8) -join ", "
$secHtml = ($data.sections | ForEach-Object {
  "<div class='card'><h2>$($_.h)</h2><p class='lead'>$($_.p)</p></div>"
}) -join "`n"

$faqHtml = ""
if($data.faq){
  $faqHtml = "<div class='card'><h2>FAQ</h2>" + (($data.faq | ForEach-Object {
    "<p><b>$($_.q)</b><br/>$($_.a)</p>"
  }) -join "`n") + "</div>"
}

$srcHtml = ""
if($data.sources){
  $srcHtml = "<div class='card'><h2>Sources</h2><ul>" + (($data.sources | ForEach-Object {
    "<li><a href='$($_.url)'>$($_.label)</a></li>"
  }) -join "`n") + "</ul></div>"
}

$index = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>$($data.title)</title>
  <meta name="description" content="$($data.description)" />
  <meta name="robots" content="index,follow" />
  <link rel="stylesheet" href="/$OutDir/assets/style.css" />
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="/$OutDir/">Auto Trends</a>
      <nav class="nav">
        <a href="/$OutDir/">Index</a>
        <a href="https://mikann20041029.github.io/">Main</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <h1>$($data.title)</h1>
    <p class="lead">$($data.description)</p>
    <div class="meta">
      <span class="badge">date: $ymd</span>
      <span class="badge">source: $($pick.source)</span>
      <span class="badge">tags: $tags</span>
    </div>

    <!-- AFF_SLOT:slot1 category_hint="Utilities / Software" reason="above-the-fold reserved slot" -->
    <div class="aff-slot" data-slot="slot1"></div>

    $secHtml

    <!-- AFF_SLOT:slot2 category_hint="Productivity / SaaS" reason="mid-page reserved slot" -->
    <div class="aff-slot" data-slot="slot2"></div>

    $faqHtml
    $srcHtml

    <!-- AFF_SLOT:slot3 category_hint="Finance / Subscription" reason="end-of-content reserved slot" -->
    <div class="aff-slot" data-slot="slot3"></div>

    <p class="muted">Generated by GitHub Actions.</p>
  </main>

  <footer>
    <div class="wrap">
      <div class="muted">・ゑｽｩ $(Get-Date -Format yyyy) mikann20041029</div>
    </div>
  </footer>
</body>
</html>
"@

[System.IO.File]::WriteAllText((Join-Path $postDir "index.html"), $index, (New-Object System.Text.UTF8Encoding($false)))

# update index page
$posts = Get-ChildItem $OutDir -Directory | Where-Object { $_.Name -match "^$BaseSlug-\d{4}-\d{2}-\d{2}-" } |
  Sort-Object Name -Descending | Select-Object -First 60

$list = ($posts | ForEach-Object {
  "<li><a href='/$OutDir/$($_.Name)/'>$($_.Name)</a></li>"
}) -join "`n"

$homeHtml = @"
<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Auto Trends Index</title>
<meta name="description" content="Daily auto-generated trend pages."/>
<link rel="stylesheet" href="/$OutDir/assets/style.css"/>
</head><body>
<header class="top"><div class="wrap">
<a class="brand" href="/$OutDir/">Auto Trends</a>
<nav class="nav"><a href="https://mikann20041029.github.io/">Main</a></nav>
</div></header>
<main class="wrap">
<h1>Auto Trends Index</h1>
<p class="lead">Daily generated pages. Sources: HN + Reddit. AI generation is optional (requires OPENAI_API_KEY).</p>
<div class="card"><h2>Latest</h2><ul>$list</ul></div>
</main>
<footer><div class="wrap"><div class="muted">Generated by GitHub Actions.</div></div></footer>
</body></html>
"@

[System.IO.File]::WriteAllText((Join-Path $OutDir "index.html"), $homeHtml, (New-Object System.Text.UTF8Encoding($false)))
git add -A -- "$OutDir"
git commit -m "Auto: $OutDir/$final" | Out-Host
git push | Out-Host

"OK: /$OutDir/$final/"
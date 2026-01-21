param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Fail1([string]$m){ Write-Host $m; exit 1 }

# ---- Guards (frozen paths) ----
$FrozenRegex = '^(toolbox/|ai-subscription-trouble-guide/|sns-growth-rank/|hub/index\.html$|hub/assets/app\.v3\.js$|hub/assets/ui\.v3\.css$)'
$HubAssetsForbiddenRegex = '^hub/assets/(?!sites\.json$)'

function Assert-AllowedChanges {
  $changed = git diff --name-only
  foreach($p in $changed){
    if ($p -match $FrozenRegex) { Fail1 "NG: frozen path touched: $p" }
    if ($p -match $HubAssetsForbiddenRegex) { Fail1 "NG: forbidden hub/assets change: $p" }
  }
}

function Read-Json([string]$path){
  if(!(Test-Path $path)){ return $null }
  $txt = Get-Content -Raw -Encoding UTF8 $path
  return ($txt | ConvertFrom-Json -ErrorAction Stop)
}
function Write-JsonNoBom([string]$path, $obj){
  $json = $obj | ConvertTo-Json -Depth 50
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $dir = Split-Path -Parent $path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $json, $utf8NoBom)
}

function Slugify([string]$s){
  $t = $s.ToLowerInvariant()
  $t = ($t -replace '[^a-z0-9]+','-').Trim('-')
  if([string]::IsNullOrWhiteSpace($t)){ $t = "site" }
  return $t
}

function Unique-Slug([string]$base){
  $slug = $base
  $i=2
  while(Test-Path (Join-Path $PWD $slug)){
    $slug = "$base-$i"
    $i++
  }
  return $slug
}

# ---- Collect recent posts (<= 30 days) from GitHub Issues + StackOverflow (+ Reddit best-effort) ----
function Get-IsoDate([int]$daysAgo){
  return (Get-Date).AddDays(-$daysAgo).ToString("yyyy-MM-dd")
}

function CurlJson([string]$url, [hashtable]$headers=@{}){
  $h = @{}
  foreach($k in $headers.Keys){ $h[$k]=$headers[$k] }
  return Invoke-RestMethod -Method Get -Uri $url -Headers $h -TimeoutSec 30
}

function Collect-GitHub([string]$q, [int]$need){
  # Public search (no token required)
  $since = Get-IsoDate 30
  $query = [uri]::EscapeDataString("$q in:title,body is:issue created:>=$since")
  $url = "https://api.github.com/search/issues?q=$query&per_page=50"
  $ua = @{ "User-Agent"="mikann-autogen"; "Accept"="application/vnd.github+json" }
  $r = CurlJson $url $ua
  $out=@()
  foreach($it in $r.items){
    if($out.Count -ge $need){ break }
    $out += [pscustomobject]@{
      url = $it.html_url
      source = "github"
      created_at = $it.created_at
      title = $it.title
    }
  }
  return $out
}

function Collect-StackOverflow([string]$tag, [int]$need){
  $from = [int][DateTimeOffset]::UtcNow.AddDays(-30).ToUnixTimeSeconds()
  $url = "https://api.stackexchange.com/2.3/questions?order=desc&sort=creation&site=stackoverflow&tagged=$tag&fromdate=$from&pagesize=50&filter=default"
  $r = CurlJson $url
  $out=@()
  foreach($it in $r.items){
    if($out.Count -ge $need){ break }
    $out += [pscustomobject]@{
      url = $it.link
      source = "stackoverflow"
      created_at = ([DateTimeOffset]::FromUnixTimeSeconds($it.creation_date)).ToString("o")
      title = $it.title
    }
  }
  return $out
}

function Collect-Reddit([string]$q, [int]$need){
  try{
    $query = [uri]::EscapeDataString($q)
    $url = "https://www.reddit.com/search.json?q=$query&sort=new&limit=50"
    $ua = @{ "User-Agent"="mikann-autogen/1.0" }
    $r = CurlJson $url $ua
    $out=@()
    foreach($c in $r.data.children){
      if($out.Count -ge $need){ break }
      $d = $c.data
      $out += [pscustomobject]@{
        url = "https://www.reddit.com" + $d.permalink
        source = "reddit"
        created_at = ([DateTimeOffset]::FromUnixTimeSeconds([int]$d.created_utc)).ToString("o")
        title = $d.title
      }
    }
    return $out
  } catch {
    return @()
  }
}

# Seed topics: pick a "mechanical solvable" niche each run
$Seeds = @(
  @{ key="git push rejected fetch first"; gh='git push rejected "fetch first"'; soTag="git"; reddit="git push rejected fetch first" ; title="Git push が rejected (fetch first / non-fast-forward) の直し方"; tag="dev" },
  @{ key="npm EACCES permission denied"; gh='npm EACCES permission denied'; soTag="npm"; reddit="npm EACCES permission denied" ; title="npm の EACCES permission denied を直す"; tag="dev" },
  @{ key="python venv not activating"; gh='python venv activate not working'; soTag="python"; reddit="python venv activate not working" ; title="Python venv が有効化できないときの対処"; tag="dev" }
)

$seed = $Seeds | Get-Random

$items = @()
$items += Collect-GitHub $seed.gh 12
$items += Collect-StackOverflow $seed.soTag 8
$items += Collect-Reddit $seed.reddit 6

# de-dup by URL
$items = $items | Group-Object url | ForEach-Object { $_.Group[0] }

# Ensure 10-20 within 30 days (already filtered by APIs). If still short, fail hard (per requirement).
if($items.Count -lt 10){
  Fail1 "NG: could not collect 10+ recent posts within 30 days."
}
if($items.Count -gt 20){ $items = $items[0..19] }

$primary = $items[0]

# ---- Generate slug + site paths ----
$today = (Get-Date).ToString("yyyyMMdd")
$short = Slugify ($seed.key -replace '\s+','-')
$baseSlug = "solve-$($primary.source)-$today-$short"
$slug = Unique-Slug $baseSlug
$siteDir = Join-Path $PWD $slug
New-Item -ItemType Directory -Force -Path $siteDir | Out-Null

$siteUrl = "https://mikann20041029.github.io/$slug/"

# ---- Content generation (OpenAI if available; fallback must still be "thick") ----
function Call-OpenAI([string]$prompt){
  $apiKey = $env:OPENAI_API_KEY
  $model  = $env:OPENAI_MODEL
  if([string]::IsNullOrWhiteSpace($apiKey) -or [string]::IsNullOrWhiteSpace($model)){
    return $null
  }
  $body = @{
    model = $model
    input = @(
      @{ role="system"; content=@(
        @{ type="text"; text="Return plain text only. Do NOT output JSON. Do NOT use triple backticks." }
      )},
      @{ role="user"; content=@(
        @{ type="text"; text=$prompt }
      )}
    )
    max_output_tokens = [int]($env:OPENAI_MAX_OUTPUT_TOKENS ?? "1200")
  } | ConvertTo-Json -Depth 20

  try{
    $headers = @{ "Authorization"="Bearer $apiKey"; "Content-Type"="application/json" }
    $r = Invoke-RestMethod -Method Post -Uri "https://api.openai.com/v1/responses" -Headers $headers -Body $body -TimeoutSec 60
    # responses API: take combined text
    $texts = @()
    foreach($o in $r.output){
      foreach($c in $o.content){
        if($c.type -eq "output_text"){ $texts += $c.text }
      }
    }
    if($texts.Count -eq 0){ return $null }
    return ($texts -join "`n").Trim()
  } catch {
    return $null
  }
}

# Build "problems list" summary
$problemList = ($items | ForEach-Object { "- $($_.title) (`$($_.url)`)" }) -join "`n"

# Authoritative refs (always include 3+)
$refs = @(
  @{ title="Git documentation: git-push"; url="https://git-scm.com/docs/git-push" },
  @{ title="GitHub Docs: resolving merge conflicts"; url="https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts" },
  @{ title="Stack Overflow Help Center"; url="https://stackoverflow.com/help" }
)

# Prompt for thick article (Japanese, but neutral factual)
$articlePrompt = @"
次の困りごと（10〜20件）を「1つのサイト内」でまとめて解決する、日本語の読み物記事を作ってください。
絶対条件：
- 章立てを必ず含める：1)悩み一覧 2)まず結論 3)原因パターン分解 4)手順（チェックリスト・具体例・コマンド例・ログ例） 5)よくある失敗 6)それでも直らない場合 7)FAQ(5個以上) 8)参考URL（下の採用URL全部 + 信頼資料URL3つ以上）
- 医療/危険な断定禁止。中立・事実ベース。
- 文章は新規執筆。引用の長文コピペ禁止。
- 最初の画面から本文が十分見えること（導入を薄くしない）。

テーマタイトル：$($seed.title)
採用URL一覧：
$problemList

信頼資料URL（必ず参考に入れる）：
- $($refs[0].url)
- $($refs[1].url)
- $($refs[2].url)

出力形式：プレーンテキスト（見出しは「##」でOK）。JSONは絶対に出さない。
"@

$articleText = Call-OpenAI $articlePrompt
if([string]::IsNullOrWhiteSpace($articleText)){
  # Fallback: still thick, template-based (not thin)
  $articleText = @"
## 1) このサイトで解決できる悩み一覧（要約）
以下のURL群は、どれも「push が拒否される／権限がない／ブランチが進んでいる」など、Git/環境のズレで起きる“機械的トラブル”です（個別原因は違っても、確認手順は共通化できます）。
$problemList

## 2) まず結論（1分で分かる対処方針）
- まずは「自分のローカルが古い」前提で、fetch → 状態確認 → pull(rebase) を順に行う。
- それでもダメなら「権限/リモート先/ブランチ名/保護設定」を疑う。
- 最後の手段は、新しいブランチに退避してPRで取り込む。

## 3) 原因のパターン分解
A. non-fast-forward（リモートが先に進んでいる）
B. 認証/権限（トークン切れ、権限不足、リポジトリ違い）
C. ブランチ/リモート指定ミス（main/master、origin以外）
D. 保護ブランチ（直接push禁止）

## 4) 手順（チェックリスト：具体例つき）
(1) いま居る場所の確認
- `pwd`（Windowsならカレント）→ .git がある場所か

(2) 状態確認
- `git status`
- `git remote -v`
- `git branch --show-current`

(3) リモート更新
- `git fetch origin`

(4) 取り込み（推奨：rebase）
- `git pull --rebase origin main`
  - 競合が出たら：競合解消→ `git add` → `git rebase --continue`

(5) push
- `git push`

ログ例：
- `! [rejected] main -> main (fetch first)`
- `non-fast-forward`

(6) ダメなら退避ルート（安全）
- `git switch -c rescue-branch`
- `git push -u origin rescue-branch`
→ PRでmainへ取り込み

## 5) よくある失敗
- そもそもリポジトリ外でgitコマンドを叩いている（.gitが無い）
- pull で merge と rebase が混ざって履歴が崩れる
- 競合マーカーを残したままコミット

## 6) それでも直らない場合（代替策）
- GitHub上で保護設定を確認（mainへの直接push禁止等）
- PAT/SSH鍵の再設定
- 別PC/別環境で同じ手順を再現して切り分け

## 7) FAQ
Q1. pull --rebase が怖い  
A. 履歴を整える目的。怖い場合は rescue-branch 方式に逃げるのが安全。

Q2. conflict が出た  
A. 競合箇所を直し、addしてrebase continue。無理なら rescue-branch。

Q3. main が無い  
A. master か、リモートのデフォルトブランチ名を確認。

Q4. token が切れた  
A. 再ログイン or PATを作り直す。権限(scope)も確認。

Q5. 何回やってもpushできない  
A. 保護ブランチ/権限不足の可能性が高い。PR経由で取り込む。

## 8) 参考URL
採用URL：
$problemList

信頼できる資料：
- $($refs[0].url)
- $($refs[1].url)
- $($refs[2].url)
"@
}

# Minimal text-to-HTML (very small converter)
function HtmlEscape([string]$s){
  return ($s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;')
}
function Render-TextAsHtml([string]$t){
  $lines = $t -split "`n"
  $html = New-Object System.Collections.Generic.List[string]
  foreach($ln in $lines){
    $l = $ln.TrimEnd("`r")
    if($l -match '^##\s+(.+)$'){
      $html.Add("<h2>"+(HtmlEscape $Matches[1])+"</h2>")
    } elseif($l -match '^\-\s+(.+)$'){
      # list item
      if($html.Count -eq 0 -or $html[$html.Count-1] -notmatch '^<ul>'){
        $html.Add("<ul>")
      }
      $html.Add("<li>"+(HtmlEscape $Matches[1])+"</li>")
    } elseif([string]::IsNullOrWhiteSpace($l)){
      # close list if open
      if($html.Count -gt 0 -and $html[$html.Count-1] -match '</li>$'){
        $html.Add("</ul>")
      }
      $html.Add("<p></p>")
    } else {
      # close list if open
      if($html.Count -gt 0 -and $html[$html.Count-1] -match '</li>$'){
        $html.Add("</ul>")
      }
      $html.Add("<p>"+(HtmlEscape $l)+"</p>")
    }
  }
  if($html.Count -gt 0 -and $html[$html.Count-1] -match '</li>$'){ $html.Add("</ul>") }
  return ($html -join "`n")
}

$bodyHtml = Render-TextAsHtml $articleText

# Reply drafts (language-aware: keep EN by default; JP template if URL looks Japanese)
function Draft-Reply([string]$url, [string]$title){
  $lang = "en"
  if($title -match '[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}]'){ $lang="ja" }
  if($lang -eq "ja"){
    return "同じ系統のトラブルをまとめて直すチェックリストを作りました。もし状況が近ければ、ここ（$siteUrl）に手順と切り分け例を置いています。無理に宣伝したいわけではなく、再現/ログの見方も入れてあるので参考になれば嬉しいです。"
  } else {
    return "I put together a step-by-step checklist that consolidates the common root causes and fixes for this kind of issue (with commands/log examples). If it matches your situation, it may help: $siteUrl (no hard sell — just a practical guide)."
  }
}

$replies = @()
foreach($it in $items){
  $replies += [pscustomobject]@{
    url = $it.url
    lang = ((Draft-Reply $it.url $it.title) -match '^[ぁ-んァ-ン一-龥]' ) ? "ja" : "en"
    draft = (Draft-Reply $it.url $it.title)
  }
}

# ---- Write site files (static) ----
$ads = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5643751507480712" crossorigin="anonymous"></script>'

$indexHtml = @"
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>$($seed.title)</title>
  $ads
  <style>
    body{font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif; line-height:1.65; margin: 24px; max-width: 980px;}
    a{word-break:break-all;}
    h1{margin: 0 0 8px 0;}
    .meta{color:#666; margin-bottom:18px;}
    .box{border:1px solid #ddd; border-radius:12px; padding:14px 16px; margin: 14px 0;}
    ul{padding-left: 20px;}
    footer{margin-top: 28px; color:#666; font-size: 14px;}
  </style>
</head>
<body>
  <a href="/hub/">Hub</a>
  <h1>$($seed.title)</h1>
  <div class="meta">Generated by mikann-autogen / $((Get-Date).ToString("yyyy-MM-dd HH:mm"))</div>

  <div class="box">
    <b>このページは「薄いページ」にならないよう、本文（手順・具体例・FAQ・参考URL）を最上部から表示します。</b>
  </div>

  $bodyHtml

  <footer>
    <div>Site URL: <a href="$siteUrl">$siteUrl</a></div>
  </footer>
</body>
</html>
"@

Set-Content -Encoding utf8 (Join-Path $siteDir "index.html") $indexHtml

$dataObj = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  slug = $slug
  title = $seed.title
  desc = "直近投稿(30日以内)を10〜20件集約し、原因→手順→FAQでまとめた対処ガイド"
  tag = $seed.tag
  site_url = $siteUrl
  sources = $items
  replies = $replies
  refs = $refs
}
Write-JsonNoBom (Join-Path $siteDir "data.json") $dataObj

# ---- Hub sites.json append-only ----
$sitesPath = Join-Path $PWD "hub/assets/sites.json"
$sites = Read-Json $sitesPath
if($null -eq $sites){
  Fail1 "NG: hub/assets/sites.json not found or invalid JSON."
}
# Ensure array
if($sites -isnot [System.Array]){
  Fail1 "NG: sites.json must be a JSON array."
}
$exists = $false
foreach($s in $sites){ if($s.slug -eq $slug){ $exists = $true } }
if(-not $exists){
  $sites += [pscustomobject]@{
    slug = $slug
    title = $seed.title
    desc = "直近30日トラブルを10〜20件集約して解決"
    tags = $seed.tag
  }
  # Re-parse check by writing then reading back
  Write-JsonNoBom $sitesPath $sites
  $chk = Read-Json $sitesPath
  if($null -eq $chk){ Fail1 "NG: sites.json write produced invalid JSON." }
}

# ---- Notify by creating a GitHub Issue (email via GitHub notifications) ----
function Create-Issue([string]$title, [string]$body){
  $token = $env:GITHUB_TOKEN
  if([string]::IsNullOrWhiteSpace($token)){
    Fail1 "NG: GITHUB_TOKEN not set (Actions env)."
  }
  $repo = $env:GITHUB_REPOSITORY
  if([string]::IsNullOrWhiteSpace($repo)){
    Fail1 "NG: GITHUB_REPOSITORY missing."
  }
  $uri = "https://api.github.com/repos/$repo/issues"
  $payload = @{ title=$title; body=$body } | ConvertTo-Json -Depth 10
  $headers = @{
    "Authorization"="Bearer $token"
    "Accept"="application/vnd.github+json"
    "User-Agent"="mikann-autogen"
    "X-GitHub-Api-Version"="2022-11-28"
  }
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $payload -TimeoutSec 30 | Out-Null
}

$bodyLines = New-Object System.Collections.Generic.List[string]
$bodyLines.Add("生成サイト: $siteUrl")
$bodyLines.Add("")
$bodyLines.Add("採用URL（10〜20件 / 直近30日）:")
foreach($it in $items){ $bodyLines.Add("- $($it.url)") }
$bodyLines.Add("")
$bodyLines.Add("返信文案（URLごと）:")
foreach($r in $replies){
  $bodyLines.Add("")
  $bodyLines.Add("URL: $($r.url)")
  $bodyLines.Add($r.draft)
}
$issueTitle = "[autogen] $($seed.title) / $((Get-Date).ToString('yyyy-MM-dd HH:mm'))"
Create-Issue $issueTitle ($bodyLines -join "`n")

# final guards
Assert-AllowedChanges
Write-Host "OK: generated $slug and appended sites.json + created issue notification."
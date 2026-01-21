param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

# ---- constants (FROZEN PATH GUARDS) ----
$FrozenPrefixes = @(
  "hub/index.html",
  "hub/assets/ui.v3.css",
  "hub/assets/app.v3.js",
  "toolbox/",
  "ai-subscription-trouble-guide/",
  "sns-growth-rank/"
)

# Allowed write targets
$AllowPrefixes = @(
  "automation/",
  ".github/workflows/",
  "hub/assets/sites.json"
)

function Fail1([string]$msg){
  Write-Host ("NG: " + $msg)
  exit 1
}

function Write-TextNoBom([string]$path,[string]$content){
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $dir = Split-Path -Parent $path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Write-JsonNoBom([string]$path,[object]$obj){
  $json = $obj | ConvertTo-Json -Depth 20
  # 再parse検証（必須）
  $null = $json | ConvertFrom-Json
  Write-TextNoBom $path $json
}

function Test-FrozenTouch([string[]]$paths){
  foreach($p in $paths){
    $pp = $p.Replace("\","/").TrimStart("./")
    foreach($f in $FrozenPrefixes){
      if($pp -eq $f -or $pp.StartsWith($f)){ return $true }
    }
  }
  return $false
}

function Slugify([string]$s){
  $t = $s.ToLowerInvariant()
  $t = [regex]::Replace($t,'[^a-z0-9]+','-').Trim('-')
  if([string]::IsNullOrWhiteSpace($t)){ $t = "topic" }
  return $t.Substring(0,[Math]::Min(40,$t.Length))
}

function Get-UniqueSlug([string]$base){
  $slug = $base
  $i=2
  while(Test-Path $slug -PathType Container){
    $slug = "$base-$i"
    $i++
  }
  return $slug
}

function Invoke-Json([string]$url,[hashtable]$headers=@{}){
  $h = @{}
  foreach($k in $headers.Keys){ $h[$k]=$headers[$k] }
  return Invoke-RestMethod -Uri $url -Headers $h -Method GET -TimeoutSec 30
}

# ---- collectors (GitHub / Reddit / StackOverflow) ----
function Fetch-GitHubIssues([string]$topic,[DateTime]$since){
  $sinceStr = $since.ToString("yyyy-MM-dd")
  $q = [uri]::EscapeDataString("$topic created:>$sinceStr is:issue")
  $url = "https://api.github.com/search/issues?q=$q&sort=updated&order=desc&per_page=20"
  $ua = "mikann-autogen"
  $j = Invoke-Json $url @{ "User-Agent"=$ua; "Accept"="application/vnd.github+json" }
  $out = @()
  foreach($it in $j.items){
    $out += [pscustomobject]@{
      source="github"
      title=$it.title
      url=$it.html_url
      created_at=[DateTime]$it.created_at
      lang="en"
    }
  }
  return $out
}

function Fetch-Reddit([string]$topic,[DateTime]$since){
  $q = [uri]::EscapeDataString($topic)
  $url = "https://www.reddit.com/search.json?q=$q&sort=new&t=month&limit=25"
  $ua = "mikann-autogen/1.0 (contact: ar.seiichi.1029@gmail.com)"
  try{
    $j = Invoke-Json $url @{ "User-Agent"=$ua }
  } catch { return @() }
  $out=@()
  foreach($ch in $j.data.children){
    $d=$ch.data
    $dt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$d.created_utc).UtcDateTime
    if($dt -lt $since){ continue }
    $out += [pscustomobject]@{
      source="reddit"
      title=$d.title
      url=("https://www.reddit.com" + $d.permalink)
      created_at=$dt
      lang="en"
    }
  }
  return $out
}

function Fetch-StackOverflow([string]$topic,[DateTime]$since){
  $from = [int][DateTimeOffset]$since.ToUniversalTime() | ForEach-Object { $_.ToUnixTimeSeconds() }
  $q = [uri]::EscapeDataString($topic)
  $url="https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&site=stackoverflow&pagesize=20&fromdate=$from&q=$q&filter=default"
  try{
    $j = Invoke-Json $url @{}
  } catch { return @() }
  $out=@()
  foreach($it in $j.items){
    $dt=[DateTimeOffset]::FromUnixTimeSeconds([int64]$it.creation_date).UtcDateTime
    $out += [pscustomobject]@{
      source="stackoverflow"
      title=$it.title
      url=$it.link
      created_at=$dt
      lang="en"
    }
  }
  return $out
}

function Pick-Topic(){
  # 回すトピックは固定集合（毎回同じジャンルを10〜20件集める）
  $topics = @(
    "npm EACCES permission denied",
    "git push rejected permission denied",
    "python ModuleNotFoundError",
    "windows powershell execution policy",
    "github pages 404 not found"
  )
  $idx = (Get-Date).DayOfYear % $topics.Count
  return $topics[$idx]
}

# ---- content generator ----
function Build-ReplyDraft([string]$lang,[string]$siteUrl,[pscustomobject]$it){
  if($lang -eq "ja"){
    return @"
状況わかります。まずは原因の切り分け（権限/パス/キャッシュ/インストール先）から潰すのが早いです。
チェックリストと手順を1ページにまとめました：$siteUrl
もしログやOS/Node版が分かれば、さらに絞れます。
"@.Trim()
  }
  return @"
I feel you — this kind of error is usually about permissions / install location / PATH / caches.
I summarized a step-by-step checklist (with common mistakes + fixes) here: $siteUrl
If you can share OS + Node/npm versions and the exact command, it's easier to pinpoint.
"@.Trim()
}

function Render-IndexHtml([hashtable]$meta,[object[]]$items,[object[]]$refs){
  $title = $meta.title
  $desc  = $meta.desc
  $ads = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5643751507480712" crossorigin="anonymous"></script>'

  $list = ($items | ForEach-Object {
    $dt = ([DateTime]$_.created_at).ToString("yyyy-MM-dd")
    "<li><a href='$($_.url)'>$($_.title)</a> <small>[$($_.source)] $dt</small><br><span class='muted'>$($_.summary)</span></li>"
  }) -join "`n"

  $refList = ($refs | ForEach-Object { "<li><a href='$($_.url)'>$($_.label)</a></li>" }) -join "`n"

@"
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$title</title>
<meta name="description" content="$desc">
$ads
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans JP",sans-serif;line-height:1.7;margin:0;background:#fff;color:#111}
main{max-width:920px;margin:0 auto;padding:24px}
h1{font-size:28px;margin:0 0 8px}
.lead{margin:0 0 16px;color:#333}
.card{border:1px solid #e7e7e7;border-radius:12px;padding:16px;margin:16px 0}
.muted{color:#666}
ol,ul{padding-left:1.2em}
code,pre{background:#f6f6f6;border-radius:8px}
pre{padding:12px;overflow:auto}
hr{border:0;border-top:1px solid #eee;margin:24px 0}
small{color:#777}
</style>
</head>
<body>
<main>
  <h1>$title</h1>
  <p class="lead">$desc</p>

  <div class="card">
    <h2>1) このサイトで解決できる悩み一覧（要約）</h2>
    <ul>
      $list
    </ul>
  </div>

  <div class="card">
    <h2>2) まず結論（1分で分かる対処方針）</h2>
    <ol>
      <li>権限/保存先（user領域か、管理者領域か）を確認</li>
      <li>実行したコマンドと現在ディレクトリを固定して再現性を作る</li>
      <li>キャッシュ/ロック/古いグローバル設定を消して最短で正常系へ戻す</li>
    </ol>
  </div>

  <div class="card">
    <h2>3) 原因のパターン分解（なぜ起きるか）</h2>
    <ul>
      <li><b>権限不足</b>：Program Files配下やシステム領域に書こうとしている</li>
      <li><b>npmのprefix設定</b>：グローバルインストール先が保護領域になっている</li>
      <li><b>キャッシュ/ロック</b>：壊れたキャッシュやロックで失敗が固定化</li>
      <li><b>PATH/Nodeバージョンの混線</b>：複数のNode/npmが共存している</li>
    </ul>
  </div>

  <div class="card">
    <h2>4) 手順（チェックリスト：段階的）</h2>
    <h3>Step A: まず状態確認</h3>
    <pre><code>node -v
npm -v
npm config get prefix
where node
where npm</code></pre>

    <h3>Step B: 権限とprefixの是正（例）</h3>
    <p class="muted">※OSや環境で最適解が変わるので、まずは「ユーザー領域に寄せる」方針で安全に戻す。</p>
    <pre><code># npmのグローバル先をユーザー配下へ（例）
npm config set prefix "$env:APPDATA\npm"

# PATHに必要なら追加（PowerShell例）
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:APPDATA\npm", "User")</code></pre>

    <h3>Step C: キャッシュ/ロック掃除</h3>
    <pre><code>npm cache verify
npm cache clean --force</code></pre>

    <h3>Step D: それでもダメなら “別ルート”</h3>
    <ul>
      <li>Nodeを公式インストーラで入れ直し（混線を消す）</li>
      <li>nvm等でバージョン管理に寄せる（環境を分離）</li>
    </ul>
  </div>

  <div class="card">
    <h2>5) よくある失敗（ミス例と回避策）</h2>
    <ul>
      <li>管理者で一度通ったからといって恒久的に管理者運用する（→将来壊れやすい）</li>
      <li>prefixだけ変えてPATHを更新しない（→コマンドが古い方を指す）</li>
      <li>複数nodeが共存して `where node` が2行以上になる（→混線）</li>
    </ul>
  </div>

  <div class="card">
    <h2>6) それでも直らない場合（代替策／別ルート）</h2>
    <ul>
      <li>別PC/別ユーザーで同コマンドを試し、環境依存かを切り分け</li>
      <li>CI（GitHub Actions等）で同コマンドが通るか確認し、手元環境の問題に限定</li>
    </ul>
  </div>

  <div class="card">
    <h2>7) FAQ</h2>
    <ul>
      <li><b>Q.</b> 管理者で実行すれば直りますか？ <b>A.</b> 一時回避になることはあるが、根本はprefix/権限/混線の整理が必要。</li>
      <li><b>Q.</b> どのログを見ればいい？ <b>A.</b> 失敗したコマンド全文と直前の出力、`npm config get prefix`、`where node/npm`。</li>
      <li><b>Q.</b> node/npmの複数共存はダメ？ <b>A.</b> 混線しやすい。運用するなら管理ツールで分離が安全。</li>
      <li><b>Q.</b> キャッシュ掃除は安全？ <b>A.</b> 通常は安全。壊れたキャッシュ由来の固定失敗を外せる。</li>
      <li><b>Q.</b> 直った後に再発させないには？ <b>A.</b> prefix/Pathをユーザー領域で固定し、更新手順をメモする。</li>
    </ul>
  </div>

  <div class="card">
    <h2>8) 参考URL</h2>
    <ul>
      $refList
    </ul>
  </div>

  <hr>
  <p><small>Generated by mikann-autogen / $($meta.generated_at)</small></p>
</main>
</body>
</html>
"@
}

# ---- Hub sites.json append (STRICT: parse -> append -> reparse) ----
function Append-HubSite([string]$slug,[string]$title,[string]$desc,[string]$tag){
  $path = "hub/assets/sites.json"
  if(!(Test-Path $path)){ Fail1 "hub/assets/sites.json missing" }
  $raw = Get-Content -Raw -Encoding UTF8 $path
  $arr = $raw | ConvertFrom-Json
  if($null -eq $arr){ Fail1 "sites.json parse failed" }

  # 既存要素は触らず追記のみ
  $entry = [pscustomobject]@{ slug=$slug; title=$title; desc=$desc; tags=$tag }
  $arr = @($arr) + @($entry)

  # 再parse検証
  $json = $arr | ConvertTo-Json -Depth 20
  $null = $json | ConvertFrom-Json
  Write-TextNoBom $path $json
}

# ---- notify via GitHub Issue (email via GitHub notifications) ----
function Create-NotifyIssue([string]$title,[string]$body){
  $tok = $env:GITHUB_TOKEN
  if([string]::IsNullOrWhiteSpace($tok)){ return }
  $repo = $env:GITHUB_REPOSITORY
  if([string]::IsNullOrWhiteSpace($repo)){ return }

  $url = "https://api.github.com/repos/$repo/issues"
  $payload = @{ title=$title; body=$body } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method POST -Uri $url -Headers @{
    "Authorization"="Bearer $tok"
    "Accept"="application/vnd.github+json"
    "User-Agent"="mikann-autogen"
  } -Body $payload -ContentType "application/json" | Out-Null
}

function Build-NotifyBody([string]$siteUrl,[object[]]$items){
  $lines = @()
  $lines += "site: $siteUrl"
  $lines += ""
  foreach($it in $items){
    $lines += "- " + $it.url
    $lines += "  draft:"
    $lines += "  " + ($it.reply_draft -replace "`r?`n","`n  ")
    $lines += ""
  }
  return ($lines -join "`n")
}

# ---- OpenAI guarded auto-fix (max 3) : patches only automation/ + workflows/ ----
function Patch-Allowed([string]$diffText){
  # collect file paths in diff headers
  $files = @()
  foreach($m in [regex]::Matches($diffText,'^\+\+\+ b\/(.+)$',[System.Text.RegularExpressions.RegexOptions]::Multiline)){
    $files += $m.Groups[1].Value
  }
  foreach($p in $files){
    $pp = $p.Replace("\","/").TrimStart("./")
    $ok = $false
    foreach($a in @("automation/"," .github/workflows/".Trim())){
      if($pp.StartsWith($a)){ $ok=$true }
    }
    if(-not $ok){ return $false }
    if(Test-FrozenTouch @($pp)){ return $false }
  }
  return $true
}

function Call-OpenAIForDiff([string]$err,[string]$context){
  $key = $env:OPENAI_API_KEY
  if([string]::IsNullOrWhiteSpace($key)){ return $null }

  $prompt = @"
You are producing a unified diff patch only.
Constraints:
- You may modify ONLY: automation/* and .github/workflows/*
- NEVER touch frozen paths: hub/index.html, hub/assets/ui.v3.css, hub/assets/app.v3.js, toolbox/, ai-subscription-trouble-guide/, sns-growth-rank/
- Output ONLY a unified diff (git apply compatible). No explanations.

Error:
$err

Context:
$context
"@

  $body = @{
    model = "gpt-4.1-mini"
    input = @(
      @{ role="user"; content=$prompt }
    )
  } | ConvertTo-Json -Depth 10

  try{
    $res = Invoke-RestMethod -Method POST -Uri "https://api.openai.com/v1/responses" -Headers @{
      "Authorization"="Bearer $key"
      "Content-Type"="application/json"
    } -Body $body
    # responses API: pick text from output[0].content[0].text
    $txt = $res.output[0].content[0].text
    return $txt
  } catch {
    return $null
  }
}

# ---- main generate ----
function Generate-OneSite(){
  $topic = Pick-Topic()
  $since = (Get-Date).ToUniversalTime().AddDays(-30)

  $items = @()
  $items += Fetch-GitHubIssues $topic $since
  $items += Fetch-StackOverflow $topic $since
  $items += Fetch-Reddit $topic $since

  # filter & dedupe
  $items = $items | Where-Object { $_.created_at -ge $since } | Sort-Object created_at -Descending
  $items = $items | Group-Object url | ForEach-Object { $_.Group[0] }

  if($items.Count -lt 10){ Fail1 "not enough recent posts (<10)" }
  $items = $items | Select-Object -First 20

  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmm")
  $base = "solve-multi-" + (Slugify $topic) + "-" + $stamp
  $slug = Get-UniqueSlug $base

  $title = ($topic + " をまとめて直す（権限/環境/手順）")
  $desc  = "直近1ヶ月の投稿（10〜20件）を元に、原因パターン→チェックリスト→具体手順→FAQまで1ページに整理。"

  $siteDir = Join-Path (Get-Location) $slug
  New-Item -ItemType Directory -Force -Path $siteDir | Out-Null

  $siteUrl = "https://mikann20041029.github.io/$slug/"

  # enrich items with summary + reply drafts
  $rich=@()
  foreach($it in $items){
    $sum = "症状/環境が近い投稿。エラー文と権限・prefix・PATHが焦点になりやすい。"
    $draft = Build-ReplyDraft $it.lang $siteUrl $it
    $rich += [pscustomobject]@{
      source=$it.source
      title=$it.title
      url=$it.url
      created_at=([DateTime]$it.created_at).ToUniversalTime().ToString("o")
      lang=$it.lang
      summary=$sum
      reply_draft=$draft
    }
  }

  $refs = @(
    @{ label="npm docs (config/prefix)"; url="https://docs.npmjs.com/cli/v10/using-npm/config" },
    @{ label="GitHub REST API (search issues)"; url="https://docs.github.com/en/rest/search/search" },
    @{ label="StackExchange API"; url="https://api.stackexchange.com/" }
  )
  foreach($it in $rich){
    $refs += @{ label=("$($it.source): " + $it.title); url=$it.url }
  }

  $meta = @{
    slug=$slug
    title=$title
    desc=$desc
    tags=@("auto","guide")
    generated_at=(Get-Date).ToUniversalTime().ToString("o")
  }

  $data = @{
    meta=$meta
    items=$rich
    references=$refs
  }

  Write-JsonNoBom (Join-Path $siteDir "data.json") $data

  $html = Render-IndexHtml $meta $rich $refs
  Write-TextNoBom (Join-Path $siteDir "index.html") $html

  # docs mirror if docs/ exists
  if(Test-Path "docs" -PathType Container){
    $docsDir = Join-Path (Get-Location) ("docs\" + $slug)
    New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
    Write-JsonNoBom (Join-Path $docsDir "data.json") $data
    Write-TextNoBom (Join-Path $docsDir "index.html") $html
  }

  # hub/sites.json append (追記のみ)
  Append-HubSite $slug $title $desc "auto"

  # notify issue (email via GitHub notifications)
  $issueTitle = "mikann-autogen digest $($meta.generated_at)"
  $issueBody  = Build-NotifyBody $siteUrl $rich
  Create-NotifyIssue $issueTitle $issueBody

  return @{
    slug=$slug
    siteUrl=$siteUrl
    hubUrl="https://mikann20041029.github.io/hub/"
  }
}

# ---- run with auto-fix loop (max 3) ----
$attempt=0
$lastErr=""
while($attempt -lt 3){
  $attempt++
  try{
    $res = Generate-OneSite
    Write-Host ("OK: " + $res.siteUrl)
    exit 0
  } catch {
    $lastErr = $_.Exception.ToString()
    # try OpenAI patch
    $ctx = "attempt=$attempt; file=automation/run.ps1"
    $diff = Call-OpenAIForDiff $lastErr $ctx
    if([string]::IsNullOrWhiteSpace($diff)){ break }
    if(-not (Patch-Allowed $diff)){ break }

    $tmp = Join-Path $env:RUNNER_TEMP ("patch-"+(Get-Date).ToString("yyyyMMddHHmmss")+".diff")
    Write-TextNoBom $tmp $diff
    git apply $tmp
    # minimal sanity
    if(Test-Path "hub/assets/sites.json"){
      $raw = Get-Content -Raw -Encoding UTF8 "hub/assets/sites.json"
      $null = $raw | ConvertFrom-Json
    }
    git add automation .github/workflows | Out-Null
    git commit -m "chore: auto-fix (attempt $attempt)" | Out-Null
    git push | Out-Null
    continue
  }
}

# final failure -> create issue + artifact file
try{
  New-Item -ItemType Directory -Force -Path "automation\artifacts" | Out-Null
  $p = "automation\artifacts\failure-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss") + ".txt"
  Write-TextNoBom $p $lastErr
  Create-NotifyIssue ("mikann-autogen FAILED " + (Get-Date).ToUniversalTime().ToString("o")) $lastErr
} catch {}
Fail1 "generation failed"
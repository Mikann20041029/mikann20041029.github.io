param(
  [string]$ConfigPath = "autogen/config.json",
  [string]$OutDir = "autogen/out"
)

$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

function Fail($m){ Write-Host $m; exit 1 }
function ReadJson($p){
  if(!(Test-Path $p)){ Fail "Config not found: $p" }
  return (Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function WriteUtf8NoBom([string]$path,[string]$content){
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}
function HtmlEscape([string]$s){
  if($null -eq $s){ return "" }
  return ($s.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;").Replace('"',"&quot;"))
}

$cfg = ReadJson $ConfigPath
if(!(Test-Path $OutDir)){ New-Item -ItemType Directory -Path $OutDir | Out-Null }

$apiKey = $env:OPENAI_API_KEY
if([string]::IsNullOrWhiteSpace($apiKey)){
  Fail "OPENAI_API_KEY is missing. Set env var (local) or Actions secret (CI)."
}

$items = ($cfg.items | ForEach-Object { "- $($_.name): $($_.note)" }) -join "`n"
$topic = [string]$cfg.topic
$maxItems = [int]$cfg.max_items
$today = (Get-Date).ToString("yyyy-MM-dd")

# Schema (Structured Outputs)
$schema = @{
  name = "ranking_payload"
  strict = $true
  schema = @{
    type = "object"
    additionalProperties = $false
    required = @("title","updated","ranking","faq","summary")
    properties = @{
      title   = @{ type="string" }
      updated = @{ type="string" }
      summary = @{ type="string" }
      ranking = @{
        type="array"
        items=@{
          type="object"
          additionalProperties = $false
          required=@("rank","name","reason")
          properties=@{
            rank=@{ type="integer" }
            name=@{ type="string" }
            reason=@{ type="string" }
          }
        }
      }
      faq = @{
        type="array"
        items=@{
          type="object"
          additionalProperties = $false
          required=@("q","a")
          properties=@{
            q=@{ type="string" }
            a=@{ type="string" }
          }
        }
      }
    }
  }
}

$instructions = @"
You are generating content for a small Japanese utility site.
Rules:
- Use natural Japanese.
- Each reason <= 60 Japanese characters.
- ranking length <= $maxItems.
- Do not invent statistics. Use only the provided candidates.
- updated must be yyyy-mm-dd.
"@

$input = @"
Topic: $topic
Date: $today
Candidates:
$items
"@

# Responses API
$bodyObj = @{
  model = "gpt-5"        # GPT-5 family is supported in Responses API :contentReference[oaicite:3]{index=3}
  reasoning = @{ effort = "low" }
  max_output_tokens = 900
  instructions = $instructions
  input = $input
  text = @{
    format = @{
      type = "json_schema"
      strict = $true
      schema = $schema.schema
    }
  }
}

$body = $bodyObj | ConvertTo-Json -Depth 40

$resp = Invoke-RestMethod -Method Post -Uri "https://api.openai.com/v1/responses" -Headers @{
  "Content-Type"="application/json"
  "Authorization"="Bearer $apiKey"
} -Body $body

# Prefer output_text (Responses API convenience) :contentReference[oaicite:4]{index=4}
$textOut = $resp.output_text
if([string]::IsNullOrWhiteSpace($textOut)){ Fail "No output_text in response." }

# Parse JSON (guaranteed by json_schema)
try { $json = $textOut | ConvertFrom-Json } catch { Fail "Bad JSON. Raw:`n$textOut" }

# Write JSON
$outJsonPath = Join-Path $OutDir "ranking.json"
WriteUtf8NoBom $outJsonPath ($json | ConvertTo-Json -Depth 40)

# Write HTML
$title   = HtmlEscape $json.title
$summary = HtmlEscape $json.summary
$updated = HtmlEscape $json.updated

$rows = ""
foreach($r in $json.ranking){
  $rk = HtmlEscape ([string]$r.rank)
  $nm = HtmlEscape ([string]$r.name)
  $rs = HtmlEscape ([string]$r.reason)
  $rows += "<tr><td>$rk</td><td>$nm</td><td>$rs</td></tr>`n"
}

$faqs = ""
foreach($f in $json.faq){
  $q = HtmlEscape ([string]$f.q)
  $a = HtmlEscape ([string]$f.a)
  $faqs += "<details><summary>$q</summary><p>$a</p></details>`n"
}

$html = @"
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>$title</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP";margin:24px;line-height:1.6;}
table{border-collapse:collapse;width:100%;max-width:900px;}
th,td{border:1px solid #ddd;padding:10px;vertical-align:top;}
th{background:#f6f6f6;text-align:left;}
small{color:#666;}
.card{max-width:900px;}
</style>
</head>
<body>
<div class="card">
<h1>$title</h1>
<p><small>updated: $updated</small></p>
<p>$summary</p>

<h2>ランキング</h2>
<table>
<thead><tr><th>#</th><th>項目</th><th>理由</th></tr></thead>
<tbody>
$rows
</tbody>
</table>

<h2>FAQ</h2>
$faqs

<hr/>
<p><small>generated automatically</small></p>
</div>
</body>
</html>
"@

$outHtmlPath = Join-Path $OutDir "index.html"
WriteUtf8NoBom $outHtmlPath $html

Write-Host "OK: wrote $outHtmlPath and $outJsonPath"
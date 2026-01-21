param(
  [string]$HubSitesPath = "hub/assets/sites.json",
  [string]$Model = ""
)

$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::UTF8

# Actions-only safety
if(-not $env:GITHUB_ACTIONS){
  throw "NG: automation/run.ps1 is Actions-only. Run via GitHub Actions workflow."
}

function Write-Utf8NoBom([string]$Path, [string]$Content){
  $enc = New-Object System.Text.UTF8Encoding($false)
  $dir = Split-Path $Path -Parent
  if($dir -and !(Test-Path $dir)){ New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}
function Read-Json([string]$Path){
  if(!(Test-Path $Path)){ throw "NG: missing $Path" }
  try { return (Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { throw "NG: JSON parse failed: $Path" }
}
function Write-Json([string]$Path, $Obj){
  $json = $Obj | ConvertTo-Json -Depth 40
  Write-Utf8NoBom $Path $json
  try { $null=(Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
  catch { throw "NG: JSON re-parse failed: $Path" }
}
function Ensure-SlugUnique([string]$BaseSlug){
  $slug=$BaseSlug; $i=2
  while(Test-Path $slug){ $slug="$BaseSlug-$i"; $i++ }
  return $slug
}
function Update-SitesJson_AppendOnly([string]$SitesPath, [hashtable]$Entry){
  $arr = Read-Json $SitesPath
  if($arr -isnot [System.Collections.IEnumerable]){ throw "NG: sites.json not array" }

  $obj = [ordered]@{
    slug  = [string]$Entry.slug
    title = [string]$Entry.title
    desc  = [string]$Entry.desc
    tags  = [string]$Entry.tags
  }

  foreach($it in $arr){ if($it.slug -eq $obj.slug){ throw "NG: duplicate slug in sites.json: $($obj.slug)" } }

  $new=@(); foreach($it in $arr){ $new += $it }
  $new += (New-Object PSObject -Property $obj)
  Write-Json $SitesPath $new
}

function Call-OpenAI([string]$Prompt){
  if([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)){ throw "NG: OPENAI_API_KEY missing" }

  $useModel = $Model
  if([string]::IsNullOrWhiteSpace($useModel)){
    $useModel = $env:OPENAI_MODEL
    if([string]::IsNullOrWhiteSpace($useModel)){ $useModel = "gpt-5-mini" }
  }

  $uri = "https://api.openai.com/v1/responses"
  $headers = @{
    Authorization = "Bearer $env:OPENAI_API_KEY"
    "Content-Type" = "application/json"
  }

  $maxOut = 900
  if($env:OPENAI_MAX_OUTPUT_TOKENS){
    try { $maxOut = [int]$env:OPENAI_MAX_OUTPUT_TOKENS } catch {}
  }

  $body = @{
    model = $useModel
    input = @(
      @{ role="system"; content="Return ONLY valid JSON. No markdown. Schema: {title:string, desc:string, tags:string, body_html:string}" },
      @{ role="user"; content=$Prompt }
    )
    max_output_tokens = $maxOut
  } | ConvertTo-Json -Depth 20

  $res = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body

  if($res.output_text){ return [string]$res.output_text }

  if($res.output){
    foreach($o in $res.output){
      if($o.content){
        foreach($c in $o.content){
          if($c.type -eq "output_text" -and $c.text){ return [string]$c.text }
          if($c.text){ return [string]$c.text }
        }
      }
    }
  }
  throw "NG: OpenAI response text not found"
}

function Slugify([string]$s){
  $t = $s.ToLowerInvariant()
  $t = ($t -replace '[^a-z0-9]+','-').Trim('-')
  if([string]::IsNullOrWhiteSpace($t)){ $t = "item" }
  return $t
}

# =========================
# MAIN
# =========================
$topicsPath = "automation/topics.txt"
if(!(Test-Path $topicsPath)){
  Write-Host "No topics file: $topicsPath -> No changes"
  exit 0
}

$lines = Get-Content $topicsPath -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if(-not $lines -or $lines.Count -eq 0){
  Write-Host "No topics -> No changes"
  exit 0
}

$topic = [string]$lines[0]
# pop 1 line
$rest = @()
for($i=1; $i -lt $lines.Count; $i++){ $rest += $lines[$i] }
Write-Utf8NoBom $topicsPath (($rest -join "`n") + ($(if($rest.Count -gt 0){"`n"}else{""})))

$date = (Get-Date).ToString("yyyy-MM-dd")
$base = "qt-$date-" + (Slugify $topic)
$dirRel = Ensure-SlugUnique ("autogen/out/" + $base)
$indexRel = ($dirRel.TrimEnd("/")) + "/index.html"

$title = $topic
$desc  = "Auto-generated quick guide."
$tags  = "auto"

$bodyHtml = "<p>Auto-generated page.</p>"

if(-not [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)){
  $prompt = @"
Create a concise web page for this topic.
Topic: $topic
Return JSON only with keys:
title (<=80 chars), desc (<=140 chars), tags (comma-separated <=60 chars), body_html (safe HTML, no scripts).
"@
  try {
    $jsonText = Call-OpenAI $prompt
    $obj = $jsonText | ConvertFrom-Json
    if($obj.title){ $title = [string]$obj.title }
    if($obj.desc){  $desc  = [string]$obj.desc }
    if($obj.tags){  $tags  = [string]$obj.tags }
    if($obj.body_html){ $bodyHtml = [string]$obj.body_html }
  } catch {
    Write-Host "WARN: OpenAI failed, fallback. $($_.Exception.Message)"
  }
}

$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>$title</title>
</head>
<body>
<main style="font-family:system-ui;max-width:900px;margin:24px auto;padding:0 16px">
  <p><a href="/hub/">Hub</a></p>
  <h1>$title</h1>
  <p>$desc</p>
  <hr/>
  $bodyHtml
  <hr/>
  <p style="opacity:.7">Generated by GitHub Actions</p>
</main>
</body>
</html>
"@

Write-Utf8NoBom $indexRel $html

# Update hub list (append-only)
Update-SitesJson_AppendOnly $HubSitesPath @{
  slug  = $dirRel
  title = $title
  desc  = $desc
  tags  = $tags
}

Write-Host "OK: generated $indexRel and updated $HubSitesPath"
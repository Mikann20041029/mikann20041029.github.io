param(
  [string]$BaseSlug = "qt"
)

$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

function Write-Utf8NoBom([string]$Path, [string]$Content){
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $dir = Split-Path $Path -Parent
  if($dir -and !(Test-Path $dir)){ New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Slugify([string]$s){
  $s = $s.ToLowerInvariant()
  $s = [regex]::Replace($s, "[^a-z0-9]+", "-").Trim("-")
  if([string]::IsNullOrWhiteSpace($s)){ $s = "topic" }
  return $s.Substring(0, [Math]::Min(60, $s.Length))
}

# 1) pick a topic (placeholder: you will replace this with "trend fetch + OpenAI API" later)
$topic = "daily-tools"
$ymd = (Get-Date).ToString("yyyy-MM-dd")
$slug = "{0}-{1}-{2}" -f $BaseSlug, $ymd, (Slugify $topic)

# avoid overwrite
$final = $slug
$i=2
while(Test-Path $final){
  $final = "$slug-$i"
  $i++
}

New-Item -ItemType Directory -Path "$final/assets" -Force | Out-Null

$title = "Quick Trend Guide: $topic"
$desc  = "Auto-generated guide page. (Trend source + OpenAI API wiring is added in the next step.)"

$index = @"
<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>$title</title><meta name="description" content="$desc"/>
<link rel="stylesheet" href="./assets/style.css"/></head>
<body>
<main style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui">
  <h1>$title</h1>
  <p>$desc</p>
  <p>Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>

  <!-- AFF_SLOT:slot1 category_hint="Utilities / Software" reason="reserved slot" -->
  <div class="aff-slot" data-slot="slot1"></div>

  <p><a href="https://mikann20041029.github.io/">Back to main</a></p>
</main>
</body></html>
"@

$css = @"
.aff-slot{border:1px dashed rgba(0,0,0,.25);padding:10px;border-radius:10px;color:rgba(0,0,0,.55)}
"@

Write-Utf8NoBom "$final/index.html" $index
Write-Utf8NoBom "$final/assets/style.css" $css

git add "$final/index.html" "$final/assets/style.css" | Out-Host
git commit -m "Auto: add $final" | Out-Host
git push | Out-Host

"OK: $final"
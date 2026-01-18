$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function WriteUtf8NoBom([string]$path, [string]$content){
  $dir = Split-Path -Parent $path
  if($dir -and !(Test-Path $dir)){ New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $content, $Utf8NoBom)
}
function ReadText([string]$path){
  if(!(Test-Path $path)){ return "" }
  return [System.IO.File]::ReadAllText($path, $Utf8NoBom)
}
function DetectDocsMode(){
  if(Test-Path "docs"){ return $true }
  if(Test-Path ".github/workflows"){
    $wf = Get-ChildItem ".github/workflows" -File -Recurse -ErrorAction SilentlyContinue
    foreach($f in $wf){
      $t = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
      if($t -match "(?i)\bdocs\b"){ return $true }
    }
  }
  return $false
}
function ExtractTitle([string]$html){
  if($html -match "(?is)<title>\s*(.*?)\s*</title>"){ return ($Matches[1] -replace "\s+"," ").Trim() }
  if($html -match "(?is)<h1[^>]*>\s*(.*?)\s*</h1>"){ return ($Matches[1] -replace "<[^>]+>","" -replace "\s+"," ").Trim() }
  return ""
}
function ExtractDesc([string]$html){
  if($html -match '(?is)<meta\s+name=["'']description["'']\s+content=["''](.*?)["'']\s*/?>'){ return ($Matches[1] -replace "\s+"," ").Trim() }
  if($html -match "(?is)<p[^>]*>\s*(.{20,220}?)\s*</p>"){
    $x = ($Matches[1] -replace "<[^>]+>","" -replace "\s+"," ").Trim()
    if($x.Length -gt 240){ $x = $x.Substring(0,240) }
    return $x
  }
  return ""
}
function GuessTags([string]$slug){
  $tags = @()
  if($slug -match "(?i)tool|calc|converter|compress|generator"){ $tags += "tool" }
  if($slug -match "(?i)guide|how|trouble|help"){ $tags += "guide" }
  if($slug -match "(?i)rank|growth|sns"){ $tags += "rank" }
  if($tags.Count -eq 0){ $tags += "site" }
  return $tags
}

$Repo = Get-Location
$UseDocs = DetectDocsMode
$scanRoots = @($Repo.Path)
if($UseDocs){ $scanRoots += (Join-Path $Repo.Path "docs") }

# hub slug は /hub/ か /hub-2/ のどっちか（最初に存在する方）
$hubSlug = "hub"
if(!(Test-Path (Join-Path $Repo.Path $hubSlug))){
  $i=2
  while(Test-Path (Join-Path $Repo.Path ("hub-$i"))){ $i++ }
  # もしhub本体が hub-2.. にあるならそれを探す
  for($k=2; $k -lt $i; $k++){
    if(Test-Path (Join-Path $Repo.Path ("hub-$k"))){ $hubSlug = "hub-$k"; break }
  }
}

$items = @()
$seen = @{}
foreach($root in $scanRoots){
  if(!(Test-Path $root)){ continue }
  $dirs = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue
  foreach($d in $dirs){
    $name = $d.Name
    if($name -in @(".git",".github","node_modules","scripts")){ continue }
    if($root -eq $Repo.Path -and $name -eq "docs"){ continue }
    if($name -like "hub*"){ continue } # hub自身は一覧から除外
    $idx = Join-Path $d.FullName "index.html"
    if(!(Test-Path $idx)){ continue }
    $slug = $name
    if($seen.ContainsKey($slug)){ continue }
    $html = ReadText $idx
    $title = ExtractTitle $html
    if([string]::IsNullOrWhiteSpace($title)){ $title = $slug }
    $desc = ExtractDesc $html
    $tags = GuessTags $slug
    $obj = [ordered]@{ slug=$slug; title=$title; desc=$desc; tags=$tags }
    $items += (New-Object psobject -Property $obj)
    $seen[$slug]=$true
  }
}
$items = $items | Sort-Object slug
$json = ($items | ConvertTo-Json -Depth 6)

WriteUtf8NoBom (Join-Path $Repo.Path "$hubSlug/assets/sites.json") $json
if($UseDocs){
  WriteUtf8NoBom (Join-Path $Repo.Path "docs/$hubSlug/assets/sites.json") $json
}
Write-Host "Hub list updated: /$hubSlug/assets/sites.json"
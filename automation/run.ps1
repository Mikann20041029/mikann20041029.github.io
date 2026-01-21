param(
  [string]$HubSitesPath = "hub/assets/sites.json",
  [string]$Model = ""
)

$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

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

  $maxOut = 1200
  if($env:OPENAI_MAX_OUTPUT_TOKENS){
    try { $maxOut = [int]$env:OPENAI_MAX_OUTPUT_TOKENS } catch {}
  }

  $body = @{
    model = $useModel
    input = @(
      @{ role="system"; content="Return ONLY valid JSON. No markdown. Follow the schema exactly." },
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

# （以下、あなたの生成ロジックはこのまま。ここでは省略せず置いてOK）
# ただしローカル実行はブロックしているので Actions 以外では動きません。
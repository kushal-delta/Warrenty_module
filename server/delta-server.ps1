# =============================================================================
#  Warranty + Service Demo - local data service
# -----------------------------------------------------------------------------
#  Serves the application and keeps everything entered in it in one real file:
#
#      <this folder>\..\data\warranty-service-data.json
#
#  Because every browser on the machine reads and writes that same file, work
#  entered in Chrome shows up in Edge, and copying the whole folder to another
#  PC or a USB stick carries the data with it.
#
#  Started by "Start Warranty Service Demo.cmd" - there is nothing to install.
# =============================================================================

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is empty when the script is piped rather than run from a file,
# so fall back to the invocation path
$serverDir = $PSScriptRoot
if (-not $serverDir) { $serverDir = Split-Path -Parent $MyInvocation.MyCommand.Definition }
$appRoot   = Split-Path -Parent $serverDir
$dataDir   = Join-Path $appRoot 'data'
$dataFile  = Join-Path $dataDir 'warranty-service-data.json'
$bakFile   = Join-Path $dataDir 'warranty-service-data.previous.json'
$snapDir   = Join-Path $dataDir 'daily'

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
if (-not (Test-Path $snapDir)) { New-Item -ItemType Directory -Path $snapDir | Out-Null }

$utf8 = New-Object System.Text.UTF8Encoding($false)

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'
  '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'
  '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8'; '.7z'='application/x-7z-compressed'
}

# ---------------------------------------------------------------- listener --
$listener = New-Object System.Net.HttpListener
$port = 0
foreach ($p in 8700..8720) {
  try {
    $try = New-Object System.Net.HttpListener
    $try.Prefixes.Add("http://localhost:$p/")
    $try.Start()
    $listener = $try; $port = $p
    break
  } catch {
    if ($try) { try { $try.Close() } catch {} }
  }
}

if ($port -eq 0) {
  Write-Host ''
  Write-Host '  Could not open a port between 8700 and 8720.' -ForegroundColor Red
  Write-Host '  Another copy of the demo is probably already running - check your browser tabs.'
  Write-Host ''
  Read-Host '  Press Enter to close'
  exit 1
}

$appUrl = "http://localhost:$port/app/index.html"

Write-Host ''
Write-Host '  Delta Warranty + Service - SOLARTIVE TECHNO INDUSTRIES PVT LTD' -ForegroundColor Cyan
Write-Host '  ---------------------------------------------------------------'
Write-Host "  Application : $appUrl"
Write-Host "  Data file   : $dataFile"
Write-Host ''
Write-Host '  Leave this window open while you use the system.' -ForegroundColor Yellow
Write-Host '  Closing it stops the application. Your data stays in the file.'
Write-Host '  ---------------------------------------------------------------'
Write-Host ''

Start-Process $appUrl | Out-Null

# ----------------------------------------------------------------- helpers --
function Send-Bytes($ctx, [byte[]]$bytes, [string]$type, [int]$code = 200) {
  $ctx.Response.StatusCode = $code
  $ctx.Response.ContentType = $type
  $ctx.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
  # lets a page opened by double-clicking index.html (a file:// page, so its
  # origin is "null") find this service and redirect itself here
  $ctx.Response.Headers['Access-Control-Allow-Origin'] = '*'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Text($ctx, [string]$text, [string]$type = 'application/json; charset=utf-8', [int]$code = 200) {
  Send-Bytes $ctx ([System.Text.Encoding]::UTF8.GetBytes($text)) $type $code
}

function Get-Stamp { (Get-Date).ToString('dd-MMM-yyyy HH:mm:ss') }

# ------------------------------------------------------------------- loop ---
while ($listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  if (-not $ctx) { continue }

  try {
    $path   = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $method = $ctx.Request.HttpMethod

    # ------------------------------------------------------------- the API --
    # "are you there?" - used by a double-clicked index.html to find us
    if ($path -eq '/api/ping') {
      Send-Text $ctx ('{"ok":true,"app":"delta-warranty","port":' + $port + '}')
    }

    elseif ($path -eq '/api/data') {

      if ($method -eq 'GET') {
        $json = '{}'
        if (Test-Path -LiteralPath $dataFile) {
          try { $json = [System.IO.File]::ReadAllText($dataFile, $utf8) } catch { $json = '{}' }
        }
        if ([string]::IsNullOrWhiteSpace($json)) { $json = '{}' }
        $saved = ''
        if (Test-Path -LiteralPath $dataFile) {
          $saved = (Get-Item -LiteralPath $dataFile).LastWriteTime.ToString('dd-MMM-yyyy HH:mm:ss')
        }
        # the change-set is embedded verbatim so it is never re-serialised
        $body = '{"ok":true,"file":' + (ConvertTo-Json $dataFile) +
                ',"saved":' + (ConvertTo-Json $saved) + ',"data":' + $json + '}'
        Send-Text $ctx $body
      }
      elseif ($method -eq 'POST') {
        $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()

        if ([string]::IsNullOrWhiteSpace($body)) {
          Send-Text $ctx '{"ok":false,"error":"empty body"}' 'application/json; charset=utf-8' 400
        }
        else {
          # keep the version we are about to replace, plus one snapshot a day
          if (Test-Path -LiteralPath $dataFile) {
            try { Copy-Item -LiteralPath $dataFile -Destination $bakFile -Force } catch {}
            $snap = Join-Path $snapDir ('warranty-service-data-' + (Get-Date).ToString('yyyy-MM-dd') + '.json')
            if (-not (Test-Path -LiteralPath $snap)) {
              try { Copy-Item -LiteralPath $dataFile -Destination $snap -Force } catch {}
            }
          }
          # write to a temporary file first so a crash mid-write cannot shred the data
          $tmp = $dataFile + '.tmp'
          [System.IO.File]::WriteAllText($tmp, $body, $utf8)
          Move-Item -LiteralPath $tmp -Destination $dataFile -Force

          $stamp = Get-Stamp
          Write-Host ("  {0}  saved  {1:N0} KB" -f $stamp, ($body.Length / 1KB))
          Send-Text $ctx ('{"ok":true,"saved":' + (ConvertTo-Json $stamp) +
                          ',"file":' + (ConvertTo-Json $dataFile) + '}')
        }
      }
      else {
        Send-Text $ctx '{"ok":false}' 'application/json; charset=utf-8' 405
      }
    }

    # --------------------------------------------------------- static files --
    else {
      if ($path -eq '/' -or $path -eq '') {
        $ctx.Response.StatusCode = 302
        $ctx.Response.RedirectLocation = '/app/index.html'
      }
      else {
        $rel  = $path.TrimStart('/') -replace '/', '\'
        $file = Join-Path $appRoot $rel
        # keep the request inside the application folder
        $full = [System.IO.Path]::GetFullPath($file)
        if (-not $full.StartsWith([System.IO.Path]::GetFullPath($appRoot), [StringComparison]::OrdinalIgnoreCase)) {
          $ctx.Response.StatusCode = 403
        }
        elseif (Test-Path -LiteralPath $full -PathType Leaf) {
          $ext = [System.IO.Path]::GetExtension($full).ToLower()
          $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
          Send-Bytes $ctx ([System.IO.File]::ReadAllBytes($full)) $type
        }
        else {
          $ctx.Response.StatusCode = 404
        }
      }
    }
  }
  catch {
    Write-Host ("  error: " + $_.Exception.Message) -ForegroundColor Red
    try { $ctx.Response.StatusCode = 500 } catch {}
  }
  finally {
    try { $ctx.Response.Close() } catch {}
  }
}

try { $listener.Stop(); $listener.Close() } catch {}

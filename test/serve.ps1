# Throwaway static file server for running the integration tests over http://.
param([int]$Port = 8123, [string]$Root = (Split-Path $PSScriptRoot -Parent), [int]$MaxSeconds = 120)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
$mime = @{ ".html"="text/html"; ".js"="application/javascript"; ".css"="text/css"; ".svg"="image/svg+xml"; ".json"="application/json" }
$deadline = (Get-Date).AddSeconds($MaxSeconds)
while ($listener.IsListening -and (Get-Date) -lt $deadline) {
  $async = $listener.GetContextAsync()
  while (-not $async.AsyncWaitHandle.WaitOne(500)) {
    if ((Get-Date) -ge $deadline) { $listener.Stop(); exit }
  }
  $ctx = $async.GetAwaiter().GetResult()
  if ($ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -eq '/__results') {
    $reader = New-Object IO.StreamReader($ctx.Request.InputStream)
    $reader.ReadToEnd() | Out-File "$env:TEMP\integration-results.txt" -Encoding utf8
    $ctx.Response.Close()
    continue
  }
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/') -replace '/', '\'
  if ($rel -eq '') { $rel = 'index.html' }
  $path = Join-Path $Root $rel
  if ((Test-Path $path -PathType Leaf) -and ((Resolve-Path $path).Path.StartsWith((Resolve-Path $Root).Path))) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ext = [IO.Path]::GetExtension($path).ToLower()
    if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
$listener.Stop()

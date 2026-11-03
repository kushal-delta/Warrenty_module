param([string]$QueryFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root = Split-Path $PSScriptRoot -Parent
$setting = Get-Content -LiteralPath (Join-Path $root 'erp-source.env') | Where-Object { $_.StartsWith('ERP_SQL_CONNECTION=') } | Select-Object -First 1
$connection = New-Object System.Data.SqlClient.SqlConnection ($setting.Substring('ERP_SQL_CONNECTION='.Length))
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 30
  $command.CommandText = Get-Content -LiteralPath $QueryFile -Raw
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
  $data = New-Object System.Data.DataTable
  [void]$adapter.Fill($data)
  $rows = @($data | ForEach-Object { $row = [ordered]@{}; foreach ($column in $data.Columns) { $value = $_[$column.ColumnName]; $row[$column.ColumnName] = if ($value -is [DBNull]) { $null } else { $value } }; [pscustomobject]$row })
  ConvertTo-Json -InputObject $rows -Depth 4 -Compress
} finally { $connection.Dispose() }

# Install an extracted, locally built standalone distribution.
param([Parameter(Mandatory, Position=0)][string]$Distribution)
$ErrorActionPreference = 'Stop'
$sourceDir = (Resolve-Path -LiteralPath $Distribution).ProviderPath
$executable = Join-Path $sourceDir 'a4code.exe'
$reported = & $executable --version
if ($LASTEXITCODE -ne 0 -or "$reported" -notmatch 'v(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.+-]+)?)$') { throw 'Cannot determine the local a4code version.' }
$version = $Matches[1]
$baseDir = if ($env:A4CODE_HOME) { $env:A4CODE_HOME } else { Join-Path $HOME '.a4code' }
$versionsDir = [IO.Path]::GetFullPath((Join-Path $baseDir 'runtime/versions'))
if (($versionsDir + '\').StartsWith(($sourceDir.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unpack the distribution outside the install directory.' }
[IO.Directory]::CreateDirectory($versionsDir) | Out-Null
$target = Join-Path $versionsDir $version
$lock = Join-Path $versionsDir ".install-$version"
New-Item -ItemType Directory -Path $lock | Out-Null
try {
  if (Test-Path -LiteralPath $target) {
    if ((Get-Item -LiteralPath $target).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or
        !(Test-Path -LiteralPath (Join-Path $target 'a4code.exe') -PathType Leaf) -or
        (Get-Content -Raw -LiteralPath (Join-Path $target '.install-complete')).Trim() -ne $version) { throw "An incomplete installation already occupies $target." }
  } else {
    $stage = Join-Path $lock 'runtime'
    Copy-Item -LiteralPath $sourceDir -Destination $stage -Recurse
    & (Join-Path $stage 'a4code.exe') --version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not run the staged executable.' }
    [IO.File]::WriteAllText((Join-Path $stage '.install-complete'), "$version`n")
    [IO.Directory]::Move($stage, $target)
  }
  & (Join-Path $target 'a4code.exe') install
  exit $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $lock -Recurse -Force
}

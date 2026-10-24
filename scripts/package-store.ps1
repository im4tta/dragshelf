[CmdletBinding()]
param(
    [string]$IdentityName,
    [string]$Publisher,
    [string]$PublisherDisplayName,
    [string]$DisplayName = 'Drag Shelf',
    [switch]$ValidationOnly
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskMetadata = Get-Content (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$taskVersion = "$($taskMetadata.version).0"
if ($taskVersion -notmatch '^\d+\.\d+\.\d+\.0$') { throw 'Store builds require a three-part release version; the fourth part is reserved as 0.' }
if ($ValidationOnly) {
    $IdentityName = 'DragShelf.ValidationOnly'
    $Publisher = 'CN=DragShelfValidationOnly'
    $PublisherDisplayName = 'Validation only - not for submission'
} elseif ([string]::IsNullOrWhiteSpace($IdentityName) -or [string]::IsNullOrWhiteSpace($Publisher) -or [string]::IsNullOrWhiteSpace($PublisherDisplayName)) {
    throw 'Supply the exact IdentityName, Publisher, and PublisherDisplayName from Partner Center Product identity. Never upload a validation package.'
}
if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Invalid package identity name.' }
if ($Publisher -notmatch '^CN=') { throw 'Publisher must be the exact CN= value from Partner Center.' }

$taskSuffix = if ($ValidationOnly) { 'validation' } else { 'store' }
$taskStage = Join-Path $taskRoot "dist/msix-$taskSuffix"
$taskAssets = Join-Path $taskStage 'Assets'
New-Item -ItemType Directory -Force -Path $taskAssets | Out-Null

# Reuse the app's existing artwork; no new branding is introduced.
Add-Type -AssemblyName System.Drawing
$taskSourceImage = [Drawing.Image]::FromFile((Join-Path $taskRoot 'build/icon.png'))
try {
    foreach ($taskAsset in @(@('StoreLogo.png',50), @('Square44x44Logo.png',44), @('Square150x150Logo.png',150), @('StoreListingLogo.png',300))) {
        $taskBitmap = New-Object Drawing.Bitmap ([int]$taskAsset[1]), ([int]$taskAsset[1])
        $taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
        try {
            $taskGraphics.Clear([Drawing.Color]::Transparent)
            $taskGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $taskGraphics.DrawImage($taskSourceImage, 0, 0, $taskBitmap.Width, $taskBitmap.Height)
            $taskBitmap.Save((Join-Path $taskAssets $taskAsset[0]), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $taskGraphics.Dispose(); $taskBitmap.Dispose() }
    }
    $taskIconBitmap = New-Object Drawing.Bitmap $taskSourceImage, 256, 256
    $taskStream = New-Object IO.MemoryStream
    try {
        $taskIconBitmap.Save($taskStream, [Drawing.Imaging.ImageFormat]::Png)
        $taskIconBytes = $taskStream.ToArray()
        $taskIconFile = [IO.File]::Create((Join-Path $taskStage 'DragShelf.ico'))
        $taskWriter = New-Object IO.BinaryWriter $taskIconFile
        try {
            $taskWriter.Write([uint16]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]1)
            $taskWriter.Write([byte]0); $taskWriter.Write([byte]0); $taskWriter.Write([byte]0); $taskWriter.Write([byte]0)
            $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]32)
            $taskWriter.Write([uint32]$taskIconBytes.Length); $taskWriter.Write([uint32]22); $taskWriter.Write($taskIconBytes)
        } finally { $taskWriter.Dispose(); $taskIconFile.Dispose() }
    } finally { $taskStream.Dispose(); $taskIconBitmap.Dispose() }
} finally { $taskSourceImage.Dispose() }

$taskManifest = [IO.File]::ReadAllText((Join-Path $taskRoot 'windows/store/AppxManifest.xml'))
$taskValues = @{
    IDENTITY_NAME = $IdentityName; PUBLISHER = $Publisher; VERSION = $taskVersion
    DISPLAY_NAME = $DisplayName; PUBLISHER_DISPLAY_NAME = $PublisherDisplayName
}
foreach ($taskKey in $taskValues.Keys) { $taskManifest = $taskManifest.Replace("{{$taskKey}}", [Security.SecurityElement]::Escape($taskValues[$taskKey])) }
[xml]$taskManifestXml = $taskManifest
$taskUtf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $taskStage 'AppxManifest.xml'), $taskManifest, $taskUtf8)
Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE'), (Join-Path $taskRoot 'PRIVACY.md') -Destination $taskStage -Force

# Embed an icon and version information in the native executable.
$taskRcVersion = $taskVersion.Replace('.', ',')
$taskIconRcPath = (Join-Path $taskStage 'DragShelf.ico').Replace('\', '\\')
$taskResource = @"
#include <windows.h>
2 ICON "$taskIconRcPath"
1 VERSIONINFO
 FILEVERSION $taskRcVersion
 PRODUCTVERSION $taskRcVersion
 FILEFLAGSMASK 0x3fL
 FILEFLAGS 0
 FILEOS 0x40004L
 FILETYPE 0x1L
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "FileDescription", "Drag Shelf\0"
   VALUE "FileVersion", "$taskVersion\0"
   VALUE "ProductName", "Drag Shelf\0"
   VALUE "ProductVersion", "$taskVersion\0"
   VALUE "OriginalFilename", "DragShelf.exe\0"
   VALUE "LegalCopyright", "MIT License - Copyright (c) 2026 Santhon\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x409, 1200
 END
END
"@
$taskResourcePath = Join-Path $taskRoot "dist/store-$taskSuffix.rc"
$taskResPath = Join-Path $taskRoot "dist/store-$taskSuffix.res"
$taskObjPath = Join-Path $taskRoot "dist/store-$taskSuffix.obj"
[IO.File]::WriteAllText($taskResourcePath, $taskResource, $taskUtf8)
& rc.exe /nologo "/fo$taskResPath" $taskResourcePath
if ($LASTEXITCODE -ne 0) { throw 'Windows resource compilation failed.' }
& cl.exe /nologo /std:c++17 /EHsc /O2 /MT /utf-8 /DNOMINMAX /DDRAGSHELF_STORE /D_CRT_SECURE_NO_WARNINGS /D_WINSOCK_DEPRECATED_NO_WARNINGS (Join-Path $taskRoot 'windows/DragShelf-source.cpp') $taskResPath "/Fe:$(Join-Path $taskStage 'DragShelf.exe')" "/Fo:$taskObjPath" /link /SUBSYSTEM:WINDOWS user32.lib gdi32.lib shell32.lib shlwapi.lib ole32.lib oleaut32.lib uuid.lib advapi32.lib comctl32.lib msimg32.lib ws2_32.lib
if ($LASTEXITCODE -ne 0) { throw 'Windows compilation failed.' }

# MakeAppx validates the manifest and package payload. Store submissions need no paid signing certificate.
$taskMakeAppx = Get-Command makeappx.exe -ErrorAction SilentlyContinue
if (-not $taskMakeAppx) {
    $taskSdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    $taskMakeAppx = Get-ChildItem -Path "$taskSdkRoot/*/x64/makeappx.exe" | Sort-Object FullName -Descending | Select-Object -First 1
}
if (-not $taskMakeAppx) { throw 'Install the Windows SDK containing MakeAppx.exe.' }
$taskMakeAppxPath = if ($taskMakeAppx.Source) { $taskMakeAppx.Source } else { $taskMakeAppx.FullName }
# Keep build-only resources outside the package payload.
$taskMappingPath = Join-Path $taskRoot "dist/store-$taskSuffix.map.txt"
$taskMappingLines = @('[Files]')
foreach ($taskPayloadFile in Get-ChildItem -LiteralPath $taskStage -File -Recurse) {
    if ($taskPayloadFile.Extension -eq '.ico') { continue }
    $taskRelativePath = $taskPayloadFile.FullName.Substring($taskStage.Length + 1)
    $taskMappingLines += '"' + $taskPayloadFile.FullName + '" "' + $taskRelativePath + '"'
}
[IO.File]::WriteAllLines($taskMappingPath, $taskMappingLines, $taskUtf8)
$taskOutput = Join-Path $taskRoot "dist/DragShelf-$($taskMetadata.version)-windows-x64-$taskSuffix.msix"
& $taskMakeAppxPath pack /f $taskMappingPath /p $taskOutput /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX validation/packaging failed.' }
Write-Host "Created $taskOutput"
if ($ValidationOnly) { Write-Warning 'VALIDATION ONLY: do not submit this identity to Microsoft Store.' }

$jsPath = 'C:\Users\User\Documents\vscode\newnewnew\Schedsync-main\facultypage.js'
$js = [System.IO.File]::ReadAllText($jsPath)

# Find and show the quota area
$idx = $js.IndexOf('isQuota')
Write-Host "=== quota context ==="
Write-Host $js.Substring([Math]::Max(0,$idx-10), 300)

# NBK Salary Export — native Excel COM writer.
#
# Reads a JSON payload describing the "Salary Details" rows to write into a working
# copy of the canonical NBK template, then saves the result as a genuine Excel
# 97-2003 (BIFF8/OLE2) workbook. This script is the ONLY place that talks to Excel
# for this feature — it is a pure serializer: it does not compute payroll amounts,
# does not decide which records are eligible for export, and does not touch the
# "Bank Codes" reference sheet (left byte-for-byte as shipped in the template).
#
# Ownership / safety: `New-Object -ComObject Excel.Application` always creates a
# brand-new COM server process — it never attaches to an already-running Excel
# instance. This script only ever calls Quit()/ReleaseComObject() on the object
# reference it created itself; it never enumerates or touches Excel by process
# name, so a user's own interactive Excel session is never at risk.
#
# Every outcome (success or a specific, typed failure) is written to -ResultPath as
# JSON. Nothing here writes employee data to stdout/stderr — only safe, structural
# status lines (counts, booleans), so operational logs never carry PII.
#
# Control-flow note: `exit` does not reliably run enclosing `finally` blocks in
# PowerShell, which would risk leaking our own (isolated) Excel instance on a
# failure path. So once Excel is launched, every failure is raised with `throw`
# (a terminating error unwinds through `finally` normally) and turned into the
# JSON result by the single outer `catch`; the script exits exactly once, at the
# very end, after cleanup has already run.

param(
    [Parameter(Mandatory = $true)][string]$PayloadPath,
    [Parameter(Mandatory = $true)][string]$ResultPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Result([hashtable]$obj) {
    ($obj | ConvertTo-Json -Compress -Depth 6) | Set-Content -LiteralPath $ResultPath -Encoding UTF8
}

# Custom exception carrying our typed error code, so the single outer catch can
# tell a "known" failure (TEMPLATE_STRUCTURE_INVALID, etc.) apart from a truly
# unexpected one (mapped to GENERATION_FAILED).
class NbkExportError : System.Exception {
    [string]$Code
    NbkExportError([string]$code, [string]$message) : base($message) { $this.Code = $code }
}

# ── Phase A: read payload / locate template — before Excel exists, safe to exit directly ──
try {
    if (-not (Test-Path -LiteralPath $PayloadPath)) {
        Write-Result @{ ok = $false; code = 'GENERATION_FAILED'; message = "ملف بيانات الترحيل غير موجود: $PayloadPath" }
        exit 1
    }
    $payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json

    $templatePath = [string]$payload.templatePath
    $outputPath   = [string]$payload.outputPath
    $sheets       = $payload.sheets

    if (-not (Test-Path -LiteralPath $templatePath)) {
        Write-Result @{ ok = $false; code = 'TEMPLATE_MISSING'; message = 'قالب NBK غير موجود على القرص' }
        exit 1
    }

    $salaryPayload = $sheets | Where-Object { $_.name -eq 'Salary Details' } | Select-Object -First 1
    $bankPayload   = $sheets | Where-Object { $_.name -eq 'Bank Codes' }     | Select-Object -First 1
    if (-not $salaryPayload -or -not $bankPayload) {
        Write-Result @{ ok = $false; code = 'TEMPLATE_STRUCTURE_INVALID'; message = 'بيانات الترحيل لا تحتوي على ورقتي Salary Details وBank Codes' }
        exit 1
    }
}
catch {
    Write-Result @{ ok = $false; code = 'GENERATION_FAILED'; message = "تعذّرت قراءة بيانات الترحيل: $($_.Exception.Message)" }
    exit 1
}

# ── Phase B: Excel automation — from here on, every failure is `throw`n so `finally` always runs ──
$xl = $null
$wb = $null
$finalResult = $null

try {
    try {
        $xl = New-Object -ComObject Excel.Application
    }
    catch {
        throw [NbkExportError]::new('EXCEL_COM_UNAVAILABLE', 'تعذّر تشغيل Microsoft Excel — تأكد من تثبيته على هذا الجهاز')
    }

    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false
    $xl.EnableEvents = $false
    $xl.AskToUpdateLinks = $false

    try {
        $wb = $xl.Workbooks.Open($templatePath)
    }
    catch {
        throw [NbkExportError]::new('TEMPLATE_MISSING', "تعذّر فتح قالب NBK: $($_.Exception.Message)")
    }

    # ── Structural validation — FAIL CLOSED on any mismatch, by NAME not index ──
    $sheetNames = @()
    foreach ($s in $wb.Worksheets) { $sheetNames += $s.Name }
    if (-not ($sheetNames -contains 'Salary Details') -or -not ($sheetNames -contains 'Bank Codes')) {
        throw [NbkExportError]::new('TEMPLATE_STRUCTURE_INVALID', 'القالب لا يحتوي على ورقتي Salary Details وBank Codes المطلوبتين')
    }

    $ws = $wb.Worksheets.Item('Salary Details')
    $expectedHeaders = @($salaryPayload.headers)
    for ($i = 0; $i -lt $expectedHeaders.Count; $i++) {
        $actual = $ws.Cells.Item(1, $i + 1).Value2
        if ($actual -ne $expectedHeaders[$i]) {
            throw [NbkExportError]::new('TEMPLATE_STRUCTURE_INVALID', "رأس العمود $($i + 1) في ورقة Salary Details لا يطابق التنسيق البنكي المتوقع")
        }
    }

    $wsBank = $wb.Worksheets.Item('Bank Codes')
    $expectedBankHeaders = @($bankPayload.headers)
    for ($i = 0; $i -lt $expectedBankHeaders.Count; $i++) {
        $actual = $wsBank.Cells.Item(1, $i + 1).Value2
        if ($actual -ne $expectedBankHeaders[$i]) {
            throw [NbkExportError]::new('TEMPLATE_STRUCTURE_INVALID', "رأس العمود $($i + 1) في ورقة Bank Codes لا يطابق التنسيق البنكي المتوقع")
        }
    }

    # ── Clear any residual rows below the header (defensive — template ships empty) ──
    $ncols = $expectedHeaders.Count
    $used = $ws.UsedRange
    $lastUsedRow = $used.Row + $used.Rows.Count - 1
    if ($lastUsedRow -ge 2) { $ws.Rows("2:$lastUsedRow").Delete() }
    $colEndLetter = [char](64 + $ncols)
    $ws.Range("A2:${colEndLetter}20000").ClearContents()

    # ── Write EXACTLY the rows supplied by the existing validated export flow ──
    # This layer never re-derives serial numbers or re-applies payroll/approval
    # rules — it writes the rows and column order it was given, verbatim.
    $keys = @($salaryPayload.keys)
    $rows = @($salaryPayload.rows)
    for ($r = 0; $r -lt $rows.Count; $r++) {
        $row = $rows[$r]
        for ($c = 0; $c -lt $keys.Count; $c++) {
            $val = $row.($keys[$c])
            if ($null -ne $val) {
                # Explicit type coercion before handing the value to COM — late-bound
                # Excel interop can throw "Specified cast is not valid" on a bare
                # Int64/PSObject-wrapped number from JSON, so numbers are normalized
                # to [double] and everything else to [string] before assignment.
                if ($val -is [string]) {
                    $ws.Cells.Item($r + 2, $c + 1).Value2 = [string]$val
                } else {
                    $ws.Cells.Item($r + 2, $c + 1).Value2 = [double]$val
                }
            }
        }
    }

    # Explicitly enforce the bank-required integer format on the Civil Id column —
    # deterministic, not dependent on whatever formatting survived row deletion.
    $civilIdIdx = [Array]::IndexOf($keys, 'civilId')
    if ($civilIdIdx -ge 0 -and $rows.Count -gt 0) {
        $colLetter = [char](65 + $civilIdIdx)
        $ws.Range("${colLetter}2:${colLetter}$($rows.Count + 1)").NumberFormat = '0'
    }

    $ws.Range('A1').Select() | Out-Null
    $ws.Activate()

    try { $wb.RemoveDocumentInformation(99) } catch { }

    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
    $wb.SaveAs($outputPath, 56)  # 56 = xlExcel8 (BIFF8, Excel 97-2003 Workbook)
    $wb.Close($false)
    $wb = $null

    if (-not (Test-Path -LiteralPath $outputPath)) {
        throw [NbkExportError]::new('OUTPUT_INVALID', 'لم يُنشأ ملف الإخراج')
    }
    $size = (Get-Item -LiteralPath $outputPath).Length
    if ($size -le 0) {
        throw [NbkExportError]::new('OUTPUT_INVALID', 'ملف الإخراج فارغ')
    }

    $finalResult = @{ ok = $true; path = $outputPath; sizeBytes = $size; rowCount = $rows.Count }
}
catch [NbkExportError] {
    $finalResult = @{ ok = $false; code = $_.Exception.Code; message = $_.Exception.Message }
}
catch {
    $finalResult = @{ ok = $false; code = 'GENERATION_FAILED'; message = "فشل توليد ملف NBK: $($_.Exception.Message)" }
}
finally {
    if ($wb) { try { $wb.Close($false) } catch { } }
    if ($xl) {
        try { $xl.Quit() } catch { }
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null } catch { }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Result $finalResult
exit $(if ($finalResult.ok) { 0 } else { 1 })

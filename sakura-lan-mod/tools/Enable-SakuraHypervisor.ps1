$ErrorActionPreference = 'Stop'
if (-not (Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled) {
    Write-Host 'Ative Intel Virtualization Technology (VT-x) no BIOS/UEFI e reinicie o PC primeiro.'
    Read-Host 'Enter para sair'
    exit 1
}
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    exit
}
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -NoRestart
Write-Host 'Windows Hypervisor Platform habilitado. Reinicie o PC e use Iniciar teste Sakura.'
Read-Host 'Enter para sair'

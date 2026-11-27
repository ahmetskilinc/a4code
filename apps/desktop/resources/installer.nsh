!include "StrFunc.nsh"
!ifdef BUILD_UNINSTALLER
  ${UnStrRep}
  !define A4StrRep '${UnStrRep}'
!else
  ${StrRep}
  !define A4StrRep '${StrRep}'
  Var a4AppWasRunning
!endif

!macro customAppRunningMessages
  !ifndef BUILD_UNINSTALLER
    StrCpy $a4AppWasRunning 1
  !endif
  Push $0
  Push $1
  ${If} $IsPowerShellAvailable == 0
    System::Call 'kernel32::SetEnvironmentVariable(t "A4CODE_INSTALL_DIR", t "$INSTDIR")'
    nsExec::ExecToStack `"$PowerShellPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and [IO.Path]::GetDirectoryName($$_.ExecutablePath) -eq $$env:A4CODE_INSTALL_DIR } | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($$_.ExecutablePath) } | Where-Object { $$_ -in 'a4code', 'a4code (Nightly)' } | Select-Object -First 1 | ForEach-Object { [Console]::Write($$_) }"`
    Pop $0
    Pop $1
    System::Call 'kernel32::SetEnvironmentVariable(t "A4CODE_INSTALL_DIR", p 0)'
    ${If} $0 == 0
      ${If} $1 == "a4code"
      ${OrIf} $1 == "a4code (Nightly)"
        ${A4StrRep} $appRunningMessage $appRunningMessage "${PRODUCT_NAME}" $1
        ${A4StrRep} $appClosingMessage $appClosingMessage "${PRODUCT_NAME}" $1
        ${A4StrRep} $appCannotBeClosedMessage $appCannotBeClosedMessage "${PRODUCT_NAME}" $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${IfNot} ${FileExists} "$newStartMenuLink"
      !insertmacro createMenuDirectory
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  !endif

  # The template relaunches after a silent install only with --force-run, which WinGet does not pass.
  ${If} ${Silent}
  ${AndIfNot} ${isForceRun}
  ${AndIf} $a4AppWasRunning == 1
    HideWindow
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  ${EndIf}
!macroend

@echo off
REM HTML文件保护脚本 (Windows版)
REM 检查index.html是否被意外置空，如果是则自动恢复

set HTML_FILE=public\index.html
set BACKUP_FILE=public\index.html.backup
set MIN_SIZE=1000

if exist "%HTML_FILE%" (
    for %%I in ("%HTML_FILE%") do set size=%%~zI
    echo 当前文件大小: !size! 字节
    
    if !size! LSS %MIN_SIZE% (
        echo ⚠️ 检测到 index.html 文件异常小 ^(!size! 字节^)，正在恢复...
        if exist "%BACKUP_FILE%" (
            copy "%BACKUP_FILE%" "%HTML_FILE%" >nul
            echo ✅ 已从备份恢复 index.html
        ) else (
            echo ❌ 备份文件不存在，无法恢复
        )
    ) else (
        echo ✅ index.html 文件正常 ^(!size! 字节^)
    )
) else (
    echo ❌ index.html 文件不存在
)

pause
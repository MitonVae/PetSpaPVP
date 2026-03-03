#!/bin/bash
# HTML文件保护脚本
# 检查index.html是否被意外置空，如果是则自动恢复

HTML_FILE="public/index.html"
BACKUP_FILE="public/index.html.backup"
MIN_SIZE=1000  # 最小文件大小（字节）

# 检查文件大小
if [ -f "$HTML_FILE" ]; then
    size=$(wc -c < "$HTML_FILE")
    if [ "$size" -lt "$MIN_SIZE" ]; then
        echo "⚠️ 检测到 index.html 文件异常小 ($size 字节)，正在恢复..."
        if [ -f "$BACKUP_FILE" ]; then
            cp "$BACKUP_FILE" "$HTML_FILE"
            echo "✅ 已从备份恢复 index.html"
        else
            echo "❌ 备份文件不存在，无法恢复"
        fi
    else
        echo "✅ index.html 文件正常 ($size 字节)"
    fi
else
    echo "❌ index.html 文件不存在"
fi
<!--
发布新版本前更新本文件；GitHub Actions 会把它作为 GitHub Release 说明。
-->

## 本次更新

### DeepSeek 优化

- 适配 DeepSeek V4 模型：支持 `deepseek-v4-pro` 与 `deepseek-v4-flash` 的模型选择与任务绑定。
- 优化面试官回复的语气词处理，减少“好”“好的”“嗯”等固定口头垫词开头，让文字和语音面试更自然、更直接。

## 下载安装包

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `GrillMind-*-arm64.dmg` |
| Windows | `GrillMind-Setup-*.exe` |

### 使用说明

- **macOS**：打开 `.dmg` 后将 `GrillMind.app` 拖到 `Applications`，再双击启动。
- **macOS 提示“应用已损坏，无法打开”**：如果你确认安装包来自 GrillMind 的 GitHub Releases，可以在终端执行：

  ```bash
  sudo xattr -rd com.apple.quarantine "/Applications/GrillMind.app"
  ```

- **Windows**：双击 `.exe` 安装向导，一路下一步。首次打开如提示 SmartScreen 警告，点击「更多信息 → 仍要运行」。

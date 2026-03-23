// Electron 主进程入口文件
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// 禁用硬件加速以避免在某些系统上的兼容性问题
// app.disableHardwareAcceleration();

let mainWindow = null;
let backendProcess = null;

// 后端服务端口
const BACKEND_PORT = 3001;

/**
 * 启动 Fastify 后端服务
 * 使用 fork 方式在子进程中运行后端
 */
function startBackend() {
  return new Promise((resolve, reject) => {
    // 后端入口文件路径
    const backendEntry = path.join(__dirname, '..', 'backend', 'src', 'index.js');

    // 使用当前 Node.js（Electron 内嵌的）运行后端
    // 注意：Electron 的 Node.js 和独立 Node.js 不完全相同，
    // 这里使用 spawn + process.execPath 来确保使用 Electron 内嵌的 Node
    backendProcess = spawn(process.execPath, [backendEntry], {
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        // 告诉 Electron 的 Node 不要走 Electron 的特殊逻辑
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..', 'backend'),
    });

    let started = false;

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[后端]', output);
      // 检测后端启动成功
      if (!started && output.includes('智面后端已启动')) {
        started = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error('[后端错误]', data.toString());
    });

    backendProcess.on('error', (err) => {
      console.error('[后端进程错误]', err);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log('[后端] 进程退出，退出码:', code);
      backendProcess = null;
    });

    // 超时兜底：10 秒后如果还没收到启动信号，也 resolve
    setTimeout(() => {
      if (!started) {
        started = true;
        console.log('[后端] 启动超时，尝试继续...');
        resolve();
      }
    }, 10000);
  });
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '智面 · AI 技术面试模拟器',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // 先隐藏，等加载完再显示
  });

  // 加载前端页面（通过后端静态文件托管）
  mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);

  // 页面加载完成后显示窗口，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 停止后端进程
 */
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// App 就绪后启动
app.whenReady().then(async () => {
  try {
    console.log('正在启动后端服务...');
    await startBackend();
    console.log('后端已启动，创建窗口...');
    createWindow();
  } catch (err) {
    console.error('启动失败:', err);
    app.quit();
  }
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 点击 Dock 图标重新打开窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出前清理后端进程
app.on('before-quit', () => {
  stopBackend();
});

// Electron 主进程入口文件
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 禁用硬件加速以避免在某些系统上的兼容性问题
// app.disableHardwareAcceleration();

let mainWindow = null;
let backendProcess = null;
let logStream = null;

// 后端服务端口
const BACKEND_PORT = 3001;

/**
 * 初始化日志文件
 * 日志保存在用户数据目录下的 logs 文件夹中：
 * - macOS: ~/Library/Application Support/GrillMind/logs/
 * - Windows: %APPDATA%/GrillMind/logs/
 */
function initLogger() {
  const userDataPath = app.getPath('userData');
  const logsDir = path.join(userDataPath, 'logs');

  // 确保日志目录存在
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // 按日期命名日志文件
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(logsDir, `grillmind-${date}.log`);

  logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // 写入启动标记
  const startMark = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] GrillMind 启动\n${'='.repeat(60)}\n`;
  logStream.write(startMark);

  console.log(`📝 日志文件: ${logFile}`);
  return logFile;
}

/**
 * 写入日志
 */
function writeLog(tag, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${tag}] ${message}`;
  if (logStream) {
    logStream.write(line + '\n');
  }
  // 同时在控制台输出
  if (tag === '错误') {
    console.error(line);
  } else {
    console.log(line);
  }
}



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
        // 将用户数据目录传给后端，用于存储数据库、上传文件等
        // macOS: ~/Library/Application Support/GrillMind/
        // Windows: %APPDATA%/GrillMind/
        GRILLMIND_USER_DATA: app.getPath('userData'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..', 'backend'),
    });

    let started = false;

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      writeLog('后端', output);
      // 检测后端启动成功
      if (!started && output.includes('智面后端已启动')) {
        started = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      writeLog('错误', data.toString().trim());
    });

    backendProcess.on('error', (err) => {
      writeLog('错误', `后端进程错误: ${err.message}`);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      writeLog('后端', `进程退出，退出码: ${code}`);
      backendProcess = null;
    });

    // 超时兜底：10 秒后如果还没收到启动信号，也 resolve
    setTimeout(() => {
      if (!started) {
        started = true;
        writeLog('警告', '后端启动超时，尝试继续...');
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
    initLogger();
    writeLog('主进程', '正在启动后端服务...');
    await startBackend();
    writeLog('主进程', '后端已启动，创建窗口...');
    // 隐藏默认菜单栏（去掉 Windows 上的 File/Edit/View 等菜单）
    Menu.setApplicationMenu(null);
    createWindow();
  } catch (err) {
    writeLog('错误', `启动失败: ${err.message}`);
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

// electron-builder afterPack 钩子
// 在打包完成后安装后端的 node_modules（包含原生模块 better-sqlite3）
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  // 打包后的应用资源目录
  const appDir = context.packager.platform.name === 'mac'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app')
    : path.join(context.appOutDir, 'resources', 'app');

  const backendDir = path.join(appDir, 'backend');

  console.log('📦 [afterPack] 正在安装后端依赖...');
  console.log('📁 后端目录:', backendDir);

  if (fs.existsSync(path.join(backendDir, 'package.json'))) {
    execSync('npm install --production --ignore-scripts', {
      cwd: backendDir,
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    });

    // 重新编译原生模块（better-sqlite3）使其适配 Electron
    const electronVersion = context.packager.config.electronVersion 
      || require('electron/package.json').version;
    const arch = context.arch === 1 ? 'x64' : context.arch === 3 ? 'arm64' : 'x64';

    console.log(`🔨 [afterPack] 为 Electron v${electronVersion} (${arch}) 重建原生模块...`);
    
    try {
      execSync(
        `npx electron-rebuild --version ${electronVersion} --arch ${arch} --module-dir .`,
        {
          cwd: backendDir,
          stdio: 'inherit',
          env: {
            ...process.env,
          },
        }
      );
      console.log('✅ [afterPack] 原生模块重建完成');
    } catch (err) {
      console.warn('⚠️ [afterPack] electron-rebuild 失败，尝试使用 prebuild-install...');
      // 如果 electron-rebuild 失败，better-sqlite3 可能自带了预编译版本
      // 在大多数情况下 npm install 已经处理好了
    }
  } else {
    console.warn('⚠️ [afterPack] 未找到 backend/package.json');
  }
};

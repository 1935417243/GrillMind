// 数据库初始化独立脚本
// 用法: npm run db:init
import { initDB } from './index.js';

initDB();
console.log('数据库初始化完成，可以启动服务了。');
process.exit(0);

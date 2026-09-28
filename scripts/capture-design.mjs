/* =============================================================================
   码迹 · 设计稿截图脚本
   -----------------------------------------------------------------------------
   用真实运行的应用（Vite dev server）导出设计交付图：
     · 1440×900 —— 设计稿基准分辨率
     · 1280×800 —— 笔记本窗口
   每个画板都是全新上下文，示例数据重新播种，因此截图内容稳定可复现。

   用法：先 npm run dev，再 node scripts/capture-design.mjs
   ============================================================================= */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'design');
const BASE = process.env.MAJI_BASE_URL ?? 'http://127.0.0.1:5199';

const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 800 };

/** @type {Array<{file:string, path:string, size:{width:number,height:number}, ready?:string, fullPage?:boolean, after?: (page: import('@playwright/test').Page) => Promise<void>, settle?: number}>} */
const SHOTS = [
  {
    file: '01-学习首页.png',
    path: '/#/',
    size: DESKTOP,
    ready: 'text=继续学习',
  },
  {
    file: '02-笔记编辑页-函数与参数.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 900,
  },
  {
    file: '03-笔记编辑页-阅读预览.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 700,
    after: async (page) => {
      await page.getByRole('tab', { name: '预览' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    file: '04-代码块复制反馈.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 800,
    after: async (page) => {
      await page.getByRole('button', { name: '复制代码' }).first().click();
      await page.waitForTimeout(300);
    },
  },
  {
    file: '05-笔记编辑页-保存状态.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 800,
    after: async (page) => {
      await page.getByLabel('笔记标题').fill('函数与参数（补充默认值）');
      await page.waitForTimeout(120);
    },
  },
  {
    file: '06-课程与笔记管理.png',
    path: '/#/courses',
    size: DESKTOP,
    ready: 'text=共 15 篇笔记',
  },
  {
    file: '07-课程管理-删除确认.png',
    path: '/#/courses',
    size: DESKTOP,
    ready: 'text=共 15 篇笔记',
    after: async (page) => {
      await page.getByRole('button', { name: '函数与参数 的操作' }).click();
      await page.getByRole('menuitem', { name: '删除笔记' }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    file: '08-搜索页-命中结果.png',
    path: '/#/search?q=return',
    size: DESKTOP,
    ready: 'text=/找到 \\d+ 条/',
    settle: 500,
  },
  {
    file: '09-搜索浮层.png',
    path: '/#/',
    size: DESKTOP,
    ready: 'text=继续学习',
    after: async (page) => {
      await page.keyboard.press('Control+k');
      await page.getByLabel('搜索关键词').fill('range');
      await page.waitForTimeout(500);
    },
  },
  {
    file: '10-搜索无结果空状态.png',
    path: '/#/search?q=装饰器实现原理',
    size: DESKTOP,
    ready: 'text=没有找到',
    settle: 400,
  },
  {
    file: '11-复习页.png',
    path: '/#/review',
    size: DESKTOP,
    ready: 'text=今天待复习',
    settle: 400,
  },
  {
    file: '12-复习-已掌握反馈.png',
    path: '/#/review',
    size: DESKTOP,
    ready: 'text=今天待复习',
    after: async (page) => {
      await page.getByRole('button', { name: '已掌握' }).first().click();
      await page.waitForTimeout(600);
    },
  },
  {
    file: '13-新建内容-表单.png',
    path: '/#/new?type=note',
    size: DESKTOP,
    ready: 'text=新建内容',
    after: async (page) => {
      await page.getByLabel('笔记标题').fill('装饰器与闭包');
      await page.getByLabel('标签').fill('Python, 函数, 进阶');
      await page.getByLabel('一句话摘要').fill('装饰器本质上是接收函数并返回函数的高阶函数。');
      await page.waitForTimeout(300);
    },
  },
  {
    file: '14-新建内容-创建成功.png',
    path: '/#/new?type=note',
    size: DESKTOP,
    ready: 'text=新建内容',
    after: async (page) => {
      await page.getByLabel('笔记标题').fill('装饰器与闭包');
      await page.getByRole('button', { name: '创建笔记' }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    file: '15-笔记编辑页-删除确认.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 700,
    after: async (page) => {
      await page.getByRole('button', { name: '更多操作' }).click();
      await page.getByRole('menuitem', { name: '删除这篇笔记' }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    file: '16-偏好设置对话框.png',
    path: '/#/',
    size: DESKTOP,
    ready: 'text=继续学习',
    after: async (page) => {
      await page.getByRole('button', { name: '小林（用户菜单）' }).click();
      await page.getByRole('menuitem', { name: '偏好设置' }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    file: '17-深色主题.png',
    path: '/#/notes/note_func_args',
    size: DESKTOP,
    ready: '[data-testid="note-editor"]',
    settle: 800,
    after: async (page) => {
      await page.getByRole('button', { name: '小林（用户菜单）' }).click();
      await page.getByRole('menuitem', { name: '切换到深色主题' }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    file: '18-设计规范-色彩与排版.png',
    path: '/#/design/system',
    size: DESKTOP,
    ready: 'text=设计规范',
    settle: 400,
  },
  {
    file: '19-设计规范-组件状态矩阵.png',
    path: '/#/design/system',
    size: DESKTOP,
    fullPage: true,
  },
  {
    file: '20-状态画板-空状态与反馈.png',
    path: '/#/design/states',
    size: DESKTOP,
    fullPage: true,
  },
  {
    file: '21-1280-笔记编辑页-辅助栏收起.png',
    path: '/#/notes/note_func_args',
    size: LAPTOP,
    ready: '[data-testid="note-editor"]',
    settle: 900,
  },
  {
    file: '22-1280-笔记编辑页-大纲浮层.png',
    path: '/#/notes/note_func_args',
    size: LAPTOP,
    ready: '[data-testid="note-editor"]',
    settle: 700,
    after: async (page) => {
      await page.getByRole('button', { name: '展开笔记大纲' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    file: '23-1280-学习首页.png',
    path: '/#/',
    size: LAPTOP,
    ready: 'text=继续学习',
  },
  {
    file: '24-1280-课程与笔记管理.png',
    path: '/#/courses',
    size: LAPTOP,
    ready: 'text=共 15 篇笔记',
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const failures = [];

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.size,
      deviceScaleFactor: 2,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' });
      if (shot.ready) {
        await page.waitForSelector(shot.ready, { timeout: 15_000 });
      }
      if (shot.settle) await page.waitForTimeout(shot.settle);
      if (shot.after) await shot.after(page);

      await page.screenshot({
        path: join(OUT, shot.file),
        fullPage: Boolean(shot.fullPage),
      });
      console.log(`✓ ${shot.file}`);
    } catch (error) {
      failures.push({ file: shot.file, message: String(error).split('\n')[0] });
      console.error(`✗ ${shot.file} — ${String(error).split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} 张截图失败`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n全部 ${SHOTS.length} 张设计稿已输出到 design/`);
}

await main();

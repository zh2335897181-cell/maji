import { expect, test } from '@playwright/test';

type MockAIContext = { scope: string; selectedText: string; noteText?: string };

/**
 * 核心交互流程。
 * 两种目标窗口尺寸都会跑一遍：1440×900（设计稿基准）与 1280×800（笔记本）。
 * 每个用例都是全新的浏览器上下文，因此示例数据会重新播种，结果稳定。
 */

test.describe('学习首页', () => {
  test('继续学习区指向最近打开的笔记，并能进入编辑页', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByText('继续学习')).toBeVisible();

    // 示例数据里最近打开的是「函数与参数」
    await expect(page.getByRole('link', { name: '函数与参数', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '继续编辑' }).click();

    await expect(page).toHaveURL(/#\/notes\/note_func_args/);
    await expect(page.getByLabel('笔记标题')).toHaveValue('函数与参数');
  });

  test('今天的复习任务来自真实的示例数据，不是编造的统计数字', async ({ page }) => {
    await page.goto('/#/');
    const reviewSection = page.locator('section', { hasText: '今天的复习' }).first();
    await expect(reviewSection.getByText('3 项').first()).toBeVisible();
    await expect(reviewSection.getByText('盒模型里 width 到底算不算 padding')).toBeVisible();
  });
});

test.describe('笔记编辑页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/notes/note_func_args');
    await expect(page.getByLabel('笔记标题')).toHaveValue('函数与参数');
  });

  /** 窄窗口下右侧辅助栏默认收起，需要先展开（浮层形式） */
  async function openAside(page: import('@playwright/test').Page): Promise<void> {
    const aside = page.getByRole('complementary', { name: '笔记辅助信息' });
    if (!(await aside.isVisible())) {
      await page.getByRole('button', { name: '展开笔记大纲' }).click();
      await expect(aside).toBeVisible();
    }
  }

  test('三栏结构、面包屑与大纲都在位', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: '当前位置' })).toContainText('Python 入门');
    await expect(page.getByRole('toolbar', { name: '编辑工具栏' })).toBeVisible();

    // 正文里的示例代码与运行结果（只看可见的高亮层，可编辑层在阅读态下 display:none）
    await expect(page.locator('[data-language] pre code').first()).toContainText('def greet(name):');
    await expect(page.getByText('你好，小林！').first()).toBeVisible();
    await expect(page.getByText('容易混淆').first()).toBeVisible();

    await openAside(page);
    await expect(page.getByText('笔记大纲')).toBeVisible();
  });

  test('代码块可以复制，并给出「已复制」反馈', async ({ page }) => {
    const firstCode = page.locator('pre').first();
    await expect(firstCode).toContainText('def greet(name):');

    await page.getByRole('button', { name: '复制代码' }).first().click();
    await expect(page.getByRole('button', { name: '复制代码' }).first()).toContainText('已复制');

    await page.getByRole('button', { name: '显示行号' }).first().click();
    const numberedCode = page.locator('[data-testid="note-editor"] pre[data-line-numbers]').first();
    await expect(numberedCode).toBeVisible();
    await expect(numberedCode.locator('span[aria-hidden="true"]')).toContainText('1');
  });

  test('表格、高亮和快捷键帮助可从编辑工具栏使用', async ({ page }) => {
    const toolbar = page.getByRole('toolbar', { name: '编辑工具栏' });

    const paragraph = page.locator('[data-testid="note-editor"] .ProseMirror p').filter({ hasText: '函数可以把一段可重复使用的逻辑组织起来' });
    await paragraph.click({ position: { x: 24, y: 12 } });
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await toolbar.getByRole('button', { name: '高亮文字' }).click();
    await page.getByRole('menuitem', { name: '黄色重点' }).click();
    await expect(page.locator('[data-testid="note-editor"] mark').first()).toBeVisible();

    await toolbar.getByRole('button', { name: '表格（插入表格与编辑表格）' }).click();
    await page.getByRole('menuitem', { name: '插入 3 × 3 表格' }).click();
    const table = page.locator('[data-testid="note-editor"] table');
    await expect(table).toBeVisible();
    await expect(table.locator('tr')).toHaveCount(3);
    await toolbar.getByRole('button', { name: '表格（插入表格与编辑表格）' }).click();
    await page.getByRole('menuitem', { name: '在下方添加行' }).click();
    await expect(table.locator('tr')).toHaveCount(4);

    await toolbar.getByRole('button', { name: '快捷键帮助' }).click();
    const dialog = page.getByRole('dialog', { name: '键盘快捷键' });
    await expect(dialog).toContainText('笔记编辑');
    await expect(dialog).toContainText('Ctrl');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+/');
    await expect(page.getByRole('dialog', { name: '键盘快捷键' })).toBeVisible();
  });

  test('点击大纲可以跳转到对应小节', async ({ page }) => {
    await openAside(page);
    await page.getByRole('button', { name: '动手练习' }).click();
    await expect
      .poll(async () => page.locator('[data-editor-scroll]').evaluate((node) => node.scrollTop))
      .toBeGreaterThan(120);
  });

  test('收藏按钮在两种状态之间切换并给出提示', async ({ page }) => {
    const favoriteButton = page.getByRole('button', { name: '取消收藏' }).first();
    await favoriteButton.click();

    await expect(page.getByRole('button', { name: '加入收藏' }).first()).toBeVisible();
    await expect(page.getByText('已取消收藏')).toBeVisible();
  });

  test('修改标题后保存状态从「有未保存的修改」变为「已保存」', async ({ page }) => {
    const title = page.getByLabel('笔记标题');
    await title.fill('函数与参数（复习）');

    await expect(page.getByTestId('save-status')).toContainText(/有未保存的修改|正在保存|已保存/);
    await expect(page.getByTestId('save-status')).toContainText('已保存', { timeout: 5000 });
  });

  test('可以切换到阅读预览，正文变为只读', async ({ page }) => {
    await page.getByRole('tab', { name: '预览' }).click();
    await expect(page.getByText('阅读预览', { exact: false })).toBeVisible();
    await expect(page.getByTestId('note-editor')).toHaveAttribute('data-editable', 'false');
  });

  test('删除笔记需要二次确认，取消后笔记仍在', async ({ page }) => {
    await page.getByRole('button', { name: '更多操作' }).click();
    await page.getByRole('menuitem', { name: '删除这篇笔记' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('删除这篇笔记？');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('笔记标题')).toHaveValue('函数与参数');
  });
});

test.describe('搜索', () => {
  test('Ctrl+K 打开搜索浮层，命中结果并打开笔记', async ({ page }) => {
    await page.goto('/#/');
    await page.keyboard.press('Control+k');

    const input = page.getByLabel('搜索关键词');
    await expect(input).toBeFocused();
    await input.fill('range');

    const results = page.locator('[role="dialog"] button', { hasText: '条件判断与循环' });
    await expect(results.first()).toBeVisible();
    await results.first().click();

    await expect(page).toHaveURL(/#\/notes\/note_loops/);
  });

  test('搜索页支持筛选，并给出无结果时的重新搜索入口', async ({ page }) => {
    await page.goto('/#/search?q=盒模型');
    await expect(page.getByText('CSS 盒模型').first()).toBeVisible();

    await page.getByLabel('搜索关键词').fill('不存在的关键词组合');
    await expect(page.getByText('没有找到「不存在的关键词组合」相关的内容')).toBeVisible();
    await expect(page.getByRole('button', { name: '清空条件重新搜索' })).toBeVisible();
  });

  test('搜索浮层空结果时提示重新搜索', async ({ page }) => {
    await page.goto('/#/');
    await page.keyboard.press('Control+k');
    await page.getByLabel('搜索关键词').fill('装饰器实现原理');
    await expect(page.getByText('没有找到「装饰器实现原理」相关的内容')).toBeVisible();
  });
});

test.describe('课程与笔记管理', () => {
  test('课程方向可选择并保存 Spring Boot，代码默认语言使用 Java', async ({ page }) => {
    await page.goto('/#/courses');
    await page.getByRole('complementary', { name: '浏览方式' })
      .getByRole('button', { name: '新建课程', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: '新建课程' });
    await dialog.getByLabel('课程名称').fill('Spring Boot 入门');
    await dialog.getByLabel('课程技术方向').selectOption('springboot');
    await expect(dialog.getByLabel('课程技术方向')).toHaveValue('springboot');
    await dialog.getByRole('button', { name: '创建课程' }).click();

    await expect(page.getByText('已创建课程「Spring Boot 入门」')).toBeVisible();
    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('maji.local.v1') ?? '{}') as {
        courses?: Array<{ name: string; track: string; language: string }>;
      };
      return state.courses?.find((course) => course.name === 'Spring Boot 入门');
    });
    expect(saved).toMatchObject({ track: 'springboot', language: 'java' });
  });

  test('按课程筛选、重命名笔记、删除笔记', async ({ page }) => {
    await page.goto('/#/courses');
    await expect(page.getByText('共 15 篇笔记')).toBeVisible();

    // 左栏「浏览方式」里按课程筛选（侧栏课程目录同名，需要限定区域与精确名称）
    const browser = page.getByRole('complementary', { name: '浏览方式' });
    await browser.getByRole('button', { name: 'Python 入门', exact: true }).click();
    await expect(page.getByText(/共 6 篇笔记/)).toBeVisible();

    // 重命名
    await page.getByRole('button', { name: '模块与导入 的操作' }).click();
    await page.getByRole('menuitem', { name: '重命名' }).click();
    const renameInput = page.getByLabel('重命名笔记');
    await renameInput.fill('模块与导入（已整理）');
    await renameInput.press('Enter');
    await expect(page.getByText('标题已更新')).toBeVisible();

    // 删除需要确认
    await page.getByRole('button', { name: '模块与导入（已整理） 的操作' }).click();
    await page.getByRole('menuitem', { name: '删除笔记' }).click();
    await expect(page.getByRole('dialog')).toContainText('删除这篇笔记？');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('已删除「模块与导入（已整理）」')).toBeVisible();
    // 课程筛选仍然生效，所以显示的是「已从 14 篇中筛选」
    await expect(page.getByText(/已从 14 篇中筛选/)).toBeVisible();
    await expect(page.getByText('模块与导入（已整理）')).toBeHidden();
  });
});

test.describe('复习', () => {
  test('标记已掌握后知识点离开待复习列表', async ({ page }) => {
    await page.goto('/#/review');
    await expect(page.getByRole('tab', { name: /今天待复习/ })).toContainText('3');

    await page.getByRole('button', { name: '已掌握' }).first().click();
    await expect(page.getByText(/已标记为掌握/)).toBeVisible();
    await expect(page.getByRole('tab', { name: /今天待复习/ })).toContainText('2');
  });

  test('「再复习一次」把知识点排到 25 分钟之后', async ({ page }) => {
    await page.goto('/#/review');
    await page.getByRole('button', { name: '再复习一次' }).first().click();
    await expect(page.getByText(/25 分钟后再出现/)).toBeVisible();
  });

  test('已掌握分组是空的时会解释规则', async ({ page }) => {
    await page.goto('/#/review');
    await page.getByRole('tab', { name: /已掌握/ }).click();
    await expect(page.getByText('递归一定要有终止条件')).toBeVisible();
  });
});

test.describe('新建内容流程', () => {
  test('新建笔记后进入创建成功状态', async ({ page }) => {
    await page.goto('/#/new?type=note');
    await page.getByLabel('笔记标题').fill('装饰器入门');
    await page.getByRole('button', { name: '创建笔记' }).click();

    await expect(page.getByRole('heading', { name: '创建成功' })).toBeVisible();
    await expect(page.getByText('装饰器入门')).toBeVisible();
    await page.getByRole('button', { name: '打开并开始记录' }).click();
    await expect(page).toHaveURL(/#\/notes\//);
    await expect(page.getByLabel('笔记标题')).toHaveValue('装饰器入门');
  });

  test('表单校验会阻止空标题提交', async ({ page }) => {
    await page.goto('/#/new?type=note');
    await page.getByRole('button', { name: '创建笔记' }).click();
    await expect(page.getByText('请填写笔记标题')).toBeVisible();
  });
});

test.describe('AI 学习助手', () => {
  test('偏好设置内容超出窗口时可在弹窗内上下滚动', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 620 });
    await page.goto('/#/');
    await attachMockAI(page, []);
    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '偏好设置' }).click();

    const dialog = page.getByRole('dialog', { name: '偏好设置' });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(620);

    const body = dialog.locator(':scope > div').nth(1);
    const before = await body.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(before.overflowY).toBe('auto');
    expect(before.scrollHeight - before.clientHeight).toBeGreaterThan(100);
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await body.evaluate((element) => { element.scrollTop = 0; });
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
  });

  async function attachMockAI(
    page: import('@playwright/test').Page,
    requests: Array<{ action: string; context: { scope: string; selectedText: string; noteText?: string } }>,
  ): Promise<void> {
    await page.exposeFunction('__majiMockAIAsk', (action: string, context: { scope: string; selectedText: string; noteText?: string }) => {
      requests.push({ action, context });
      return action === 'exercise'
        ? { kind: 'exercise', title: '循环练习题', prompt: '写一个计算总和的循环', hint: '从 1 开始遍历', solution: 'sum(range(1, 5))' }
        : { kind: 'text', text: '这是 AI 生成的解释' };
    });
    await page.evaluate(() => {
      const bridge = {
        ai: {
          getSettings: async () => ({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', configured: true, keyPresent: true }),
          saveSettings: async (settings: { baseUrl: string; model: string }, apiKey?: string) => ({
            ...settings, configured: Boolean(apiKey), keyPresent: Boolean(apiKey),
          }),
          clearKey: async () => ({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', configured: false, keyPresent: false }),
          testConnection: async () => undefined,
          ask: async (action: string, context: MockAIContext) =>
            (window as unknown as Window & { __majiMockAIAsk: (action: string, context: MockAIContext) => Promise<unknown> }).__majiMockAIAsk(action, context),
        },
      };
      Object.defineProperty(window, 'maji', { configurable: true, value: bridge });
    });
  }

  async function selectEditorText(page: import('@playwright/test').Page): Promise<void> {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');
    await expect(editor).toBeVisible();
    await editor.evaluate((element) => {
      const paragraph = element.querySelector('p');
      const text = paragraph?.firstChild;
      if (!(text instanceof Text)) throw new Error('No paragraph text node');
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, Math.min(18, text.textContent?.length ?? 0));
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.getByRole('button', { name: '解释这段内容' })).toBeVisible();
  }

  test('配置兼容服务、确认首次隐私提示，并且只在点击后插入回答', async ({ page }) => {
    const requests: Array<{ action: string; context: { scope: string; selectedText: string; noteText?: string } }> = [];
    await page.goto('/#/notes/note_func_args');
    await expect(page.getByLabel('笔记标题')).toHaveValue('函数与参数');
    await attachMockAI(page, requests);

    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '偏好设置' }).click();
    const settings = page.getByRole('region', { name: 'AI 服务' });
    await settings.getByLabel('接口地址').fill('https://api.deepseek.com/v1');
    await settings.getByLabel('模型名称').fill('deepseek-chat');
    await settings.getByLabel('API 密钥').fill('sk-e2e-only');
    await settings.getByRole('button', { name: '保存 AI 设置' }).click();
    await expect(settings.getByText('AI 服务已配置')).toBeVisible();
    await settings.getByRole('button', { name: '测试连接' }).click();
    await expect(settings.getByText('连接成功')).toBeVisible();
    await page.keyboard.press('Escape');

    await selectEditorText(page);
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');
    const originalText = await editor.innerText();
    await page.getByRole('button', { name: '解释这段内容' }).click();
    await expect(page.getByText(/首次使用 AI/)).toBeVisible();
    await expect(page.getByText(/选中内容会发送到你配置的 AI 服务/)).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: '打开 AI 设置' }).click();
    await expect(page.getByRole('dialog', { name: '偏好设置' }).getByRole('region', { name: 'AI 服务' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '我已了解，继续' }).click();
    await expect(page.getByText('这是 AI 生成的解释')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.context.scope).toBe('selection');
    expect(requests[0]?.context.selectedText.length).toBeGreaterThan(0);
    expect(await editor.innerText()).toBe(originalText);

    await page.getByRole('button', { name: '插入到笔记' }).click();
    await expect(editor).toContainText('这是 AI 生成的解释');
  });

  test('整篇笔记需要显式切换，练习需要再次确认，浮层始终在视口内', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/#/notes/note_func_args');
    await page.evaluate(() => localStorage.setItem('maji.ai.consent.v1', '1'));
    const requests: Array<{ action: string; context: { scope: string; selectedText: string; noteText?: string } }> = [];
    await attachMockAI(page, requests);
    await selectEditorText(page);
    await page.getByRole('button', { name: '结合整篇笔记' }).click();
    await expect(page.getByText(/整篇笔记正文将发送到你配置的 AI 服务/)).toBeVisible();

    const floating = page.getByTestId('ai-selection-assistant');
    const box = await floating.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(900);
    expect(box!.y + box!.height).toBeLessThanOrEqual(700);

    await page.getByRole('button', { name: '生成练习题' }).click();
    if (await page.getByRole('button', { name: '我已了解，继续' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '我已了解，继续' }).click();
    }
    await expect(page.getByText('循环练习题')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.context.scope).toBe('note');
    expect(requests[0]?.context.noteText?.length).toBeGreaterThan(0);
    await expect(page.getByText('已添加关联练习')).toBeHidden();
    await page.getByRole('button', { name: '添加为关联练习' }).click();
    await expect(page.getByText('已添加关联练习')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(floating).toBeHidden();

    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');
    await page.locator('[data-editor-scroll]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await editor.evaluate((element) => {
      const paragraphs = element.querySelectorAll('p');
      const paragraph = Array.from(paragraphs).reverse().find((item) => item.textContent?.trim());
      if (!paragraph) throw new Error('No paragraph found');
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!(text instanceof Text)) throw new Error('No final paragraph text node');
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, text.textContent?.length ?? 0);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.getByRole('button', { name: '解释这段内容' })).toBeVisible();
    const bottomAnchor = await floating.boundingBox();
    expect(bottomAnchor).not.toBeNull();
    expect(bottomAnchor!.x).toBeGreaterThanOrEqual(0);
    expect(bottomAnchor!.y).toBeGreaterThanOrEqual(0);
    expect(bottomAnchor!.x + bottomAnchor!.width).toBeLessThanOrEqual(900);
    expect(bottomAnchor!.y + bottomAnchor!.height).toBeLessThanOrEqual(700);
  });
});

test.describe('响应式布局', () => {
  test('中等窄度窗口的图标栏可以浮层展开和关闭', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/#/');

    await expect(page.getByRole('complementary', { name: '主导航' })).toBeVisible();
    await expect(page.getByRole('link', { name: '学习首页' })).toBeVisible();
    await page.getByRole('button', { name: '展开侧栏' }).click();

    await expect(page.getByText('编程学习笔记')).toBeVisible();
    await expect(page.getByRole('button', { name: '关闭导航' })).toBeVisible();
    await page.getByRole('button', { name: '关闭导航' }).click();
    await expect(page.getByText('编程学习笔记')).toBeHidden();
    await expect(page.getByRole('complementary', { name: '主导航' })).toBeVisible();
  });

  test('抽屉断点可从顶栏展开，并能通过遮罩关闭', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/#/');

    await page.getByRole('button', { name: '展开导航' }).click();
    await expect(page.getByText('编程学习笔记')).toBeVisible();
    await page.getByRole('presentation').click({ position: { x: 280, y: 300 } });
    await expect(page.getByText('编程学习笔记')).toBeHidden();
  });

  test('窄窗口收起右侧辅助栏，可手动展开为浮层', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 1440) > 1300, '只在 1280 及更窄的窗口下验证');

    await page.goto('/#/notes/note_func_args');
    await expect(page.getByRole('complementary', { name: '笔记辅助信息' })).toBeHidden();

    await page.getByRole('button', { name: '展开笔记大纲' }).click();
    await expect(page.getByRole('complementary', { name: '笔记辅助信息' })).toBeVisible();
    await expect(page.getByRole('button', { name: '收起辅助栏' })).toBeVisible();
  });

  test('窄窗口下编辑区仍然保持可读宽度', async ({ page }) => {
    await page.goto('/#/notes/note_func_args');
    const paper = page.locator('[data-editor-scroll]').first();
    const box = await paper.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(600);
  });
});

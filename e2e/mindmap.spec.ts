import { expect, test, type Page } from '@playwright/test';

const node = (id: string, parentId: string | null, title: string, description = '') => ({ id, parentId, title, description, kind: 'concept', sourceRefs: [], isSupplement: false, codeExamples: [] });
const graph = { title: 'Java 面向对象', rootId: 'root', nodes: [node('root', null, 'Java 面向对象'), node('classes', 'root', '类与对象', '类定义结构，对象表示实例'), node('inheritance', 'root', '继承', '复用父类实现'), node('polymorphism', 'root', '多态', '父类引用指向子类对象'), { ...node('code', 'polymorphism', '代码示例'), kind: 'example', codeExamples: [{ language: 'java', code: 'Animal pet = new Cat();\npet.speak();' }] }, node('pitfalls', 'root', '常见易错点')], relations: [{ sourceId: 'inheritance', targetId: 'polymorphism', label: '前提' }] };
const map = { ...graph, id: 'map_demo', sources: [], options: { depth: 'standard', organization: 'knowledge', includeCode: true, highlightPitfalls: true, allowSupplement: false }, revision: 1, createdAt: '2026-10-08T02:00:00Z', updatedAt: '2026-10-08T02:00:00Z' };
async function seed(page: Page) {
  await page.goto('/#/'); await expect(page.getByRole('button', { name: '继续编辑' })).toBeVisible();
  await page.evaluate(value => localStorage.setItem('maji:mindmaps:v1', JSON.stringify([value])), map);
  await page.goto('/#/mindmaps');
  await expect(page.getByRole('button', { name: '节点 多态', exact: true })).toBeVisible();
}
test('mind map edit, shortcuts, export and restart restoration', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page);
  await page.getByRole('button', { name: '节点 多态', exact: true }).click();
  await expect(page.getByLabel('节点标题')).toHaveValue('多态');
  await page.getByLabel('节点标题').fill('运行时多态');
  await expect(page.getByRole('button', { name: '节点 运行时多态', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('0 篇来源笔记 · 已保存到本机')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '节点 运行时多态', exact: true }).click();
  await expect(page.getByLabel('节点标题')).toHaveValue('运行时多态');
  const canvas = page.getByLabel('思维导图画布'); await canvas.focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('节点标题')).toHaveValue('新知识点');
  await canvas.focus(); await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: '节点 新知识点', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '节点 运行时多态', exact: true }).click();
  await page.getByRole('button', { name: '导出导图', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: `D:/gptworkspace/2026-09-28/ni/outputs/mindmap-design/implemented-${test.info().project.name}.png` });
  expect(errors).toEqual([]);
});
test('mind map narrow window opens and closes both panels and scrolls setup', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 580 }); await seed(page);
  await page.getByRole('button', { name: '导图列表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的导图' })).toBeVisible();
  await page.getByRole('button', { name: '收起导图列表' }).click();
  await page.getByRole('button', { name: '节点 多态', exact: true }).click();
  await expect(page.getByLabel('节点标题')).toBeVisible();
  await page.getByRole('button', { name: '收起节点详情' }).click();
  await expect(page.getByLabel('节点标题')).not.toBeVisible();
  await page.getByRole('button', { name: '从笔记生成', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByText('允许 AI 补充知识（将明确标记）').scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '预览发送范围' })).toBeVisible();
  await page.screenshot({ path: `D:/gptworkspace/2026-09-28/ni/outputs/mindmap-design/narrow-${test.info().project.name}.png` });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
test('mind map panel buttons respect manual collapse at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 }); await seed(page);
  await page.getByRole('button', { name: '收起导图列表' }).click();
  await expect(page.getByRole('heading', { name: '我的导图' })).not.toBeVisible();
  await page.getByRole('button', { name: '导图列表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的导图' })).toBeVisible();
  await page.getByRole('button', { name: '收起节点详情' }).click();
  await expect(page.getByLabel('节点标题')).not.toBeVisible();
});
test('mind map deletion removes the last map and node review uses only branch snapshot', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: '节点 多态', exact: true }).click();
  await page.getByRole('button', { name: '生成复习题', exact: true }).click();
  await expect(page.getByText(/导图复习范围：Java 面向对象 · 多态/)).toBeVisible();
  await page.getByRole('button', { name: '预览将发送内容', exact: true }).click();
  await expect(page.getByText('将发送以下笔记内容')).toBeVisible();
  await expect(page.locator('details pre')).toContainText('Animal pet = new Cat();');
  await expect(page.locator('details pre')).not.toContainText('类定义结构');
  await page.goto('/#/mindmaps');
  if (!(await page.getByRole('heading', { name: '我的导图' }).isVisible())) await page.getByRole('button', { name: '导图列表', exact: true }).click();
  await page.getByRole('button', { name: '删除导图 Java 面向对象' }).click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByText('把零散笔记，整理成清晰的知识结构')).toBeVisible();
});

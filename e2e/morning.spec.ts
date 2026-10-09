import { expect, test, type Page } from '@playwright/test';
async function start(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('morning-test-started')) { localStorage.removeItem('maji:morning-notes:v1'); sessionStorage.setItem('morning-test-started', '1'); }
  });
  await page.goto('/#/morning');
}
async function create(page: Page, date: string, title: string) {
  await page.getByRole('button', { name: '新增晨考', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('日期', { exact: true }).fill(date);
  await dialog.getByLabel('标题', { exact: true }).fill(title);
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('晨考标题')).toHaveValue(title);
}
test('morning notes can be transcribed, saved, previewed and reopened', async ({ page }) => {
  await start(page); await create(page, '2026-10-09', 'Spring IOC 概念题');
  const body = page.getByRole('textbox', { name: '晨考正文' });
  await body.fill('题目：什么是 IOC？\n答案：控制反转，将对象的创建交给容器。');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status', { name: '晨考保存状态' })).toHaveText('已保存');
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(body).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'AI 续写', exact: true })).toHaveCount(0);
  await expect(page.getByText('自动批改', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('晨考标题')).toHaveValue('Spring IOC 概念题');
  await expect(page.getByRole('textbox', { name: '晨考正文' })).toContainText('将对象的创建交给容器');
  await page.screenshot({ path: `D:/gptworkspace/2026-09-28/ni/outputs/morning-${test.info().project.name}.png` });
});
test('morning list sorts by date and a narrow window can reopen the list', async ({ page }) => {
  await start(page); await create(page, '2026-10-10', '第二天'); await create(page, '2026-10-09', '第一天');
  const list = page.getByRole('complementary', { name: '晨考记录列表' });
  await expect(list.getByRole('button', { name: /打开晨考/ }).first()).toHaveAccessibleName('打开晨考：第二天（2026-10-10）');
  await page.getByLabel('晨考标题').fill('第一天补充');
  await list.getByRole('button', { name: /第二天/ }).click();
  await expect(page.getByLabel('晨考标题')).toHaveValue('第二天');
  await page.setViewportSize({ width: 760, height: 580 });
  await expect(list).not.toBeVisible();
  await page.getByRole('button', { name: '展开晨考列表' }).click();
  await list.getByRole('button', { name: /第一天补充/ }).click();
  await expect(list).not.toBeVisible();
  await expect(page.getByLabel('晨考标题')).toHaveValue('第一天补充');
});

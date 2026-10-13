import { expect, test, type Page } from '@playwright/test';
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: '新增模块', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新增编程题模块' });
  await dialog.getByLabel('新模块名称').fill(name);
  await dialog.getByRole('button', { name: '创建模块' }).click();
  await expect(page.getByLabel('模块名称', { exact: true })).toHaveValue(name);
}
test('独立模块、自定义分类、自动分类和保存互不干涉', async ({ page }) => {
  await page.goto('/#/exams');
  await create(page, '部门管理');
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'DepartmentService.java',
      mimeType: 'text/plain',
      buffer: Buffer.from('public interface DepartmentService {}'),
    });
  await expect(page.getByLabel('文件层级')).toHaveValue('Service');
  await page.getByRole('button', { name: '管理分类' }).click();
  const manager = page.getByRole('dialog', { name: '管理文件分类' });
  await manager.getByLabel('分类名称', { exact: true }).fill('业务接口');
  await manager.getByRole('button', { name: '添加分类' }).click();
  await manager.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByLabel('文件层级').selectOption('业务接口');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await create(page, '员工管理');
  await expect(page.getByLabel('文件层级')).toHaveCount(0);
  await expect(
    page.getByLabel('导入文件分类').locator('option', { hasText: '业务接口' }),
  ).toHaveCount(0);
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'DepartmentService.java',
      mimeType: 'text/plain',
      buffer: Buffer.from('// employee-only'),
    });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page
    .getByRole('complementary', { name: '编程题模块目录' })
    .getByRole('button', { name: /部门管理/ })
    .click();
  await expect(page.getByLabel('项目文件内容')).toHaveValue(
    'public interface DepartmentService {}',
  );
  await expect(page.getByLabel('文件层级')).toHaveValue('业务接口');
  await page.reload();
  await expect(page.getByLabel('文件层级')).toHaveValue('业务接口');
  await page.getByRole('link', { name: '查看历史考试与训练' }).click();
  await expect(page.getByRole('button', { name: /部门管理/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('AI 仅收到当前模块，解析随模块独立保存', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: '继续编辑' })).toBeVisible();
  await page.evaluate(() => {
    const read = () => JSON.parse(localStorage.getItem('maji:exam-records:v1') ?? '[]');
    Object.defineProperty(window, 'maji', {
      configurable: true,
      value: {
        exams: {
          list: async () => read(),
          save: async (exam: any) => {
            const rows = read();
            const result = {
              ...exam,
              revision: exam.revision + 1,
              updatedAt: new Date().toISOString(),
            };
            localStorage.setItem(
              'maji:exam-records:v1',
              JSON.stringify([result, ...rows.filter((r: any) => r.id !== exam.id)]),
            );
            return result;
          },
          analyze: async (input: any) => {
            localStorage.setItem('module-request', JSON.stringify(input));
            return {
              summary: '当前模块解析完成',
              steps: ['核对调用关系'],
              answer: '使用业务接口',
              pitfalls: [],
              missing: [],
              concepts: [],
              refs: [],
              assessment: 'unknown',
            };
          },
        },
      },
    });
  });
  await page.getByRole('link', { name: '编程题分析', exact: true }).click();
  await create(page, '私有题目 B');
  await page.getByLabel('编程题要求').fill('不能泄漏的 B 内容');
  await create(page, '当前题目 A');
  await page.getByLabel('编程题要求').fill('分析 A 的接口实现');
  await page.getByRole('button', { name: '分析当前模块', exact: true }).click();
  await page.getByRole('button', { name: '确认发送', exact: true }).click();
  await expect(page.getByLabel('当前模块解析')).toContainText('当前模块解析完成');
  const request = await page.evaluate(() => localStorage.getItem('module-request')!);
  expect(JSON.parse(request).questions).toHaveLength(1);
  expect(request).not.toContain('不能泄漏');
  await page
    .getByRole('complementary', { name: '编程题模块目录' })
    .getByRole('button', { name: /私有题目 B/ })
    .click();
  await expect(page.getByLabel('当前模块解析')).not.toContainText('当前模块解析完成');
  await page
    .getByRole('complementary', { name: '编程题模块目录' })
    .getByRole('button', { name: /当前题目 A/ })
    .click();
  await expect(page.getByLabel('当前模块解析')).toContainText('当前模块解析完成');
});

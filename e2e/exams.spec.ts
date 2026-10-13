import { expect, test } from '@playwright/test';
async function createExam(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '新增考试', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新增考试' });
  await dialog.getByLabel('新考试名称').fill('Spring Boot 项目考试');
  await dialog.getByRole('button', { name: '创建考试' }).click();
  await page
    .getByLabel('考试题干')
    .fill('修复员工查询接口，说明 Controller 到 Service 的调用流程。');
  await page.getByLabel('我的原始答案').fill('直接返回 Controller 里的数据');
  await page.getByLabel('老师参考答案').fill('通过 Service 完成业务处理');
  await page.getByLabel('错题状态').selectOption('wrong');
}
test('考试支持多文件、原始与订正答案，刷新后保留', async ({ page }) => {
  await page.goto('/#/exams/history');
  await createExam(page);
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'EmpController.java',
      mimeType: 'text/plain',
      buffer: Buffer.from('return service.list();'),
    },
    { name: 'EmpService.java', mimeType: 'text/plain', buffer: Buffer.from('List<Emp> list();') },
  ]);
  await expect(
    page.getByRole('navigation', { name: '项目文件树' }).getByRole('button'),
  ).toHaveCount(2);
  await page.getByLabel('文件路径').fill('controller/EmpController.java');
  await page.getByLabel('文件层级').selectOption('Controller');
  await page.getByLabel('订正答案').fill('沿 Controller → Service → Mapper 处理');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('maji:exam-records:v1') ?? '[]')[0]?.questions[0]?.files
            .length,
      ),
    )
    .toBe(2);
  await page.reload();
  await expect(page.getByLabel('我的原始答案')).toHaveValue('直接返回 Controller 里的数据');
  await expect(page.getByLabel('订正答案')).toHaveValue('沿 Controller → Service → Mapper 处理');
  await page.getByRole('button', { name: /错题库/ }).click();
  await expect(page.getByText('已选 1 道错题', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('AI 解题、弱项、跨层训练、答案隐藏及提交评阅完整流程', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: '继续编辑' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window, 'maji', {
      configurable: true,
      value: {
        exams: {
          list: async () => JSON.parse(localStorage.getItem('maji:exam-records:v1') ?? '[]'),
          save: async (exam: any) => {
            const records = JSON.parse(localStorage.getItem('maji:exam-records:v1') ?? '[]'),
              prev = records.find((r: any) => r.id === exam.id);
            if ((prev?.revision ?? 0) !== exam.revision) throw Error('版本冲突');
            const result = {
              ...exam,
              revision: exam.revision + 1,
              updatedAt: new Date().toISOString(),
            };
            localStorage.setItem(
              'maji:exam-records:v1',
              JSON.stringify([result, ...records.filter((r: any) => r.id !== exam.id)]),
            );
            return result;
          },
          analyze: async (input: any) => {
            localStorage.setItem('exam:last-ai-request', JSON.stringify(input));
            if (input.operation === 'train')
              return [
                {
                  id: 'training_demo',
                  title: '修复多层查询',
                  level: 'project',
                  topic: '分层职责',
                  sourceQuestionIds: [input.questions[0].id],
                  prompt: '修复 Controller 与 Service 的参数传递',
                  files: [
                    {
                      id: 'f1',
                      path: 'EmpController.java',
                      role: 'Controller',
                      language: 'java',
                      content: '// TODO: controller',
                    },
                    {
                      id: 'f2',
                      path: 'EmpService.java',
                      role: 'Service',
                      language: 'java',
                      content: '// TODO: service',
                    },
                  ],
                  referenceAnswer: '秘密参考答案：正确传递 id',
                  explanation: '保持调用层的参数一致',
                  answer: '',
                  feedback: null,
                  submittedAt: null,
                  durationSeconds: 0,
                  createdAt: new Date().toISOString(),
                },
              ];
            return {
              summary: input.operation === 'weakness' ? '疑似分层职责不清' : '沿调用链核对参数',
              steps: ['先检查接口参数', '再检查服务层'],
              answer: '通过服务层完成查询',
              pitfalls: ['不应跳过业务层'],
              missing: [],
              concepts: [
                {
                  name: '分层职责',
                  evidence: '原始答案绕过 Service',
                  questionIds: [input.questions[0].id],
                },
              ],
              refs: [],
              assessment: input.operation === 'grade' ? 'correct' : 'partial',
            };
          },
        },
      },
    });
  });
  await page.getByRole('link', { name: '编程题分析', exact: true }).click();
  await page.getByRole('link', { name: '查看历史考试与训练' }).click();
  await createExam(page);
  await page.getByRole('button', { name: 'AI 分析解题步骤' }).click();
  await expect(page.getByRole('dialog', { name: '确认 AI 分析范围' })).toContainText(
    '我的答案：直接返回',
  );
  await page.getByRole('button', { name: '确认发送' }).click();
  await expect(page.getByRole('complementary', { name: 'AI 考试解析' })).toContainText(
    '先检查接口参数',
  );
  await page.getByRole('button', { name: /错题库/ }).click();
  await page.getByRole('button', { name: '分析我的弱项' }).click();
  await page.getByRole('button', { name: '确认发送' }).click();
  await expect(page.getByRole('complementary', { name: 'AI 考试解析' })).toContainText('疑似弱项');
  await page.getByLabel('训练层次').selectOption('project');
  await page.getByLabel('训练题量').selectOption('1');
  await page.getByRole('button', { name: '生成强化训练' }).click();
  await page.getByRole('button', { name: '确认发送' }).click();
  await expect(page.getByRole('heading', { name: '修复多层查询' })).toBeVisible();
  await expect(page.getByText('秘密参考答案：正确传递 id')).toHaveCount(0);
  await page.getByLabel('训练答案').fill('Controller 接收 id，再交给 Service');
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: '提交答案并 AI 评阅' }).click();
  const modal = page.getByRole('dialog', { name: '确认 AI 分析范围' });
  await expect(modal).not.toContainText('秘密参考答案');
  await modal.getByRole('button', { name: '确认发送' }).click();
  await expect(page.getByText('秘密参考答案：正确传递 id')).toBeVisible();
  await expect(page.getByText('AI 评阅：正确', { exact: false })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('maji:exam-records:v1') ?? '[]')[0]?.trainings[0]
            ?.submittedAt,
      ),
    )
    .toBeTruthy();
  await page.getByRole('button', { name: '考试记录', exact: true }).click();
  await expect(page.getByLabel('我的原始答案')).toHaveValue('直接返回 Controller 里的数据');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

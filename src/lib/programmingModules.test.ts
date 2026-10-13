import { describe, expect, it } from 'vitest';
import { inferFileRole, newProgrammingModule } from './programmingModules';
import { validateExam, validateExamAIRequest, examSource, validateExamAIResult } from './exams';
describe('独立编程题模块', () => {
  it('一个模块只有一道编程题，支持自己的文件分类', () => {
    const module = newProgrammingModule('部门管理');
    const q = module.questions[0]!;
    q.categories = ['请求 DTO'];
    q.files = [
      {
        id: 'file_1',
        path: 'DepartmentDto.java',
        role: '请求 DTO',
        language: 'java',
        content: 'class DepartmentDto {}',
      },
    ];
    expect(q.title).toBe('部门管理');
    expect(q.type).toBe('项目题');
    expect(module.questions).toHaveLength(1);
    expect(validateExam(module).questions[0]?.categories).toEqual(['请求 DTO']);
  });
  it('同名文件可以属于不同模块，AI 来源不得混入另一个模块', () => {
    const a = newProgrammingModule('部门管理'),
      b = newProgrammingModule('员工管理');
    a.questions[0]!.files = [
      {
        id: 'file_a',
        path: 'Service.java',
        role: 'Service',
        language: 'java',
        content: 'department();',
      },
    ];
    b.questions[0]!.files = [
      {
        id: 'file_b',
        path: 'Service.java',
        role: 'Service',
        language: 'java',
        content: 'employee();',
      },
    ];
    const request = validateExamAIRequest({
      operation: 'analyze',
      questions: a.questions,
      level: 'basic',
      count: 1,
    });
    expect(examSource(request.questions)).not.toContain('employee();');
    expect(() =>
      validateExamAIResult(
        {
          summary: '分析',
          steps: [],
          answer: '答案',
          pitfalls: [],
          missing: [],
          concepts: [],
          assessment: 'unknown',
          refs: [
            { questionId: b.questions[0]!.id, path: 'Service.java', line: 1, quote: 'employee();' },
          ],
        },
        request,
      ),
    ).toThrow('引用');
  });
  it.each([
    ['DepartmentController.java', '', 'Controller'],
    ['DepartmentServiceImpl.java', '', 'Service'],
    ['DepartmentMapper.java', '', 'Mapper'],
    ['Department.java', 'package com.example.entity;', '实体'],
    ['application.yml', '', '配置'],
  ])('识别 %s 的层级', (path, content, expected) =>
    expect(inferFileRole(path, content)).toBe(expected),
  );
});

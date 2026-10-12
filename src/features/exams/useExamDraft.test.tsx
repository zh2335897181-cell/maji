import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { newExam, type ExamApi, type ExamRecord } from '../../lib/exams';
import { useExamDraft } from './useExamDraft';
it('preserves keystrokes made during a save and serializes the next revision', async () => {
  localStorage.clear();
  const exam = newExam('考试');
  exam.revision = 1;
  let finish: (value: ExamRecord) => void = () => {};
  const snapshots: ExamRecord[] = [];
  const api = {
    list: async () => [],
    analyze: vi.fn(),
    save: vi.fn(async (value: ExamRecord) => {
      snapshots.push(value);
      if (snapshots.length === 1)
        return new Promise<ExamRecord>((resolve) => {
          finish = resolve;
        });
      return { ...value, revision: value.revision + 1 };
    }),
  } as ExamApi;
  const { result, unmount } = renderHook(() => useExamDraft(api));
  await act(async () => {
    await result.current.open(exam);
  });
  act(() => result.current.edit((e) => ({ ...e, title: '第一版' })));
  let saving: Promise<ExamRecord | null | undefined>;
  await act(async () => {
    saving = result.current.save();
    await Promise.resolve();
  });
  act(() => result.current.edit((e) => ({ ...e, title: '输入中的第二版' })));
  await act(async () => {
    finish({ ...snapshots[0]!, revision: 2 });
    await saving!;
  });
  expect(result.current.draft?.title).toBe('输入中的第二版');
  expect(result.current.draft?.revision).toBe(2);
  await act(async () => {
    await result.current.save();
  });
  expect(snapshots[1]?.title).toBe('输入中的第二版');
  expect(snapshots[1]?.revision).toBe(2);
  expect(result.current.status).toBe('已保存');
  unmount();
});
it('failed saves retain the draft and do not switch exams', async () => {
  localStorage.clear();
  const exam = newExam('保留我的答案');
  exam.revision = 1;
  const api = {
    list: async () => [],
    analyze: vi.fn(),
    save: vi.fn(async () => {
      throw new Error('磁盘写入失败');
    }),
  } as ExamApi;
  const { result, unmount } = renderHook(() => useExamDraft(api));
  await act(async () => {
    await result.current.open(exam);
  });
  act(() => result.current.edit((e) => ({ ...e, remarks: '尚未保存的内容' })));
  await act(async () => {
    await expect(result.current.open(newExam('另一考试'))).rejects.toThrow('磁盘');
  });
  expect(result.current.draft?.id).toBe(exam.id);
  expect(JSON.parse(localStorage.getItem(`maji:exam-draft:${exam.id}`)!).remarks).toBe(
    '尚未保存的内容',
  );
  unmount();
});
it('opening a code reference in the same exam uses the newly saved revision', async () => {
  localStorage.clear();
  const exam = newExam('代码引用');
  exam.revision = 1;
  const api = {
    list: async () => [exam],
    analyze: vi.fn(),
    save: vi.fn(async (e: ExamRecord) => ({ ...e, revision: e.revision + 1 })),
  } as ExamApi;
  const { result, unmount } = renderHook(() => useExamDraft(api));
  await act(async () => {
    await result.current.open(exam);
  });
  act(() => result.current.edit((e) => ({ ...e, title: '已修改' })));
  const stale = result.current.draft!;
  await act(async () => {
    await result.current.open(stale);
  });
  expect(result.current.draft?.revision).toBe(2);
  act(() => result.current.edit((e) => ({ ...e, remarks: '继续编辑' })));
  await act(async () => {
    await result.current.save();
  });
  expect(result.current.draft?.revision).toBe(3);
  unmount();
});

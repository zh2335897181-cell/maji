import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor as EditorType } from '@tiptap/react';
import { AISelectionAssistant } from './AISelectionAssistant';

let editor: Editor;
let host: HTMLDivElement;
const ai = {
  getSettings: vi.fn(), saveSettings: vi.fn(), clearKey: vi.fn(), testConnection: vi.fn(),
  ask: vi.fn().mockResolvedValue({ kind: 'text', text: 'AI explanation' }),
};

function setup(editable = true) {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: [StarterKit], content: '<p>hello world</p>' });
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 90, bottom: 110, left: 160, right: 164 });
  Object.defineProperty(window, 'maji', { configurable: true, value: { ai } });
  const onCreateExercise = vi.fn().mockResolvedValue(undefined);
  render(
    <AISelectionAssistant
      editor={editor as unknown as EditorType}
      editable={editable}
      noteId="note-1"
      noteText="hello world full note"
      language="python"
      courseId="course-1"
      onCreateExercise={onCreateExercise}
      onOpenSettings={() => window.dispatchEvent(new Event('maji:open-ai-settings'))}
    />,
  );
  return { onCreateExercise };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  ai.ask.mockResolvedValue({ kind: 'text', text: 'AI explanation' });
});

afterEach(() => {
  cleanup();
  if (editor && !editor.isDestroyed) editor.destroy();
  host?.remove();
  Object.defineProperty(window, 'maji', { configurable: true, value: undefined });
});

describe('contextual AI selection actions', () => {
  it('shows actions only for a nonempty editable text selection', () => {
    setup();
    expect(screen.queryByRole('button', { name: '解释这段内容' })).not.toBeInTheDocument();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    expect(screen.getByRole('button', { name: '解释这段内容' })).toBeInTheDocument();
    expect(screen.getAllByText('仅所选内容').length).toBeGreaterThan(0);
  });

  it('does not show selection actions in preview mode', () => {
    setup(false);
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    expect(screen.queryByRole('button', { name: '解释这段内容' })).not.toBeInTheDocument();
  });

  it('requires first-use notice acknowledgment before sending selected content and links to settings', async () => {
    setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    expect(screen.getByText(/首次使用 AI.*选中内容会发送到/)).toBeInTheDocument();
    expect(ai.ask).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '打开 AI 设置' }));
    expect(screen.getByText(/首次使用 AI.*选中内容会发送到/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '我已了解，继续' }));
    await waitFor(() => expect(ai.ask).toHaveBeenCalledWith('explain', {
      selectedText: 'hello', scope: 'selection', language: 'python',
    }));
  });

  it('discloses whole-note transmission only after explicit scope selection', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '结合整篇笔记' }));
    expect(screen.getByText(/整篇笔记正文将发送到你配置的 AI 服务/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    await waitFor(() => expect(ai.ask).toHaveBeenCalledWith('explain', {
      selectedText: 'hello', noteText: 'hello world full note', scope: 'note', language: 'python',
    }));
  });

  it('does not send a selection longer than 12,000 UTF-16 code units', async () => {
    setup();
    act(() => {
      editor.commands.setContent(`<p>${'x'.repeat(12_100)}</p>`);
      editor.commands.setTextSelection({ from: 1, to: 12_101 });
    });
    expect(screen.getByText(/请缩小选区/)).toBeInTheDocument();
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it('prevents duplicate submission while the provider request is pending', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    let resolve: ((value: { kind: 'text'; text: string }) => void) | undefined;
    ai.ask.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    expect(screen.getByRole('button', { name: '解释这段内容' })).toBeDisabled();
    expect(ai.ask).toHaveBeenCalledOnce();
    await act(async () => { resolve?.({ kind: 'text', text: '完成' }); });
  });

  it('shows desktop-only support and makes no request without the desktop bridge', () => {
    setup();
    Object.defineProperty(window, 'maji', { configurable: true, value: undefined });
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    expect(screen.getByText(/仅桌面版可使用 AI/)).toBeInTheDocument();
    expect(ai.ask).not.toHaveBeenCalled();
  });

  it('previews a response without changing the note or creating an exercise', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    const { onCreateExercise } = setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    const original = editor.getJSON();
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    expect(await screen.findByText('AI explanation')).toBeInTheDocument();
    expect(editor.getJSON()).toEqual(original);
    expect(onCreateExercise).not.toHaveBeenCalled();
  });

  it('inserts only on explicit confirmation, after the selection, as ordinary text', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    ai.ask.mockResolvedValueOnce({ kind: 'text', text: '<img onerror=alert(1)>\nsecond line' });
    setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    expect(await screen.findByLabelText('AI 结果面板')).toHaveTextContent('<img onerror=alert(1)>');
    expect(editor.getText({ blockSeparator: '\n' })).toBe('hello world');
    await userEvent.click(screen.getByRole('button', { name: '插入到笔记' }));
    const insertedText = editor.getText({ blockSeparator: '\n' });
    expect(insertedText).toContain('hello');
    expect(insertedText).toContain('world');
    expect(insertedText).toContain('<img onerror=alert(1)>');
    expect(host.querySelector('img')).toBeNull();
  });

  it('creates an associated exercise only after the explicit add action', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    ai.ask.mockResolvedValueOnce({ kind: 'exercise', title: '循环练习', prompt: '写一个循环', hint: '从 1 开始', solution: 'for i in range(3): pass' });
    const { onCreateExercise } = setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '生成练习题' }));
    expect(await screen.findByText('循环练习')).toBeInTheDocument();
    expect(onCreateExercise).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '添加为关联练习' }));
    expect(onCreateExercise).toHaveBeenCalledWith({
      title: '循环练习', prompt: '写一个循环', hint: '从 1 开始', solution: 'for i in range(3): pass',
      language: 'python', difficulty: 'easy', noteId: 'note-1', courseId: 'course-1',
    });
  });

  it('keeps the panel open on a provider error and lets the user retry', async () => {
    localStorage.setItem('maji.ai.consent.v1', '1');
    ai.ask.mockRejectedValueOnce(new Error('AI 服务连接失败')).mockResolvedValueOnce({ kind: 'text', text: '重试完成' });
    setup();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    await userEvent.click(screen.getByRole('button', { name: '解释这段内容' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 服务连接失败');
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('重试完成')).toBeInTheDocument();
    expect(ai.ask).toHaveBeenCalledTimes(2);
  });

  it('clears the captured context when closed with Escape or the selection becomes empty', async () => {
    setup();
    act(() => editor.commands.setTextSelection({ from: 2, to: 7 }));
    expect(screen.getByRole('button', { name: '解释这段内容' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('ai-selection-assistant')).not.toBeInTheDocument();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    expect(screen.getByRole('button', { name: '解释这段内容' })).toBeInTheDocument();
    act(() => editor.commands.setTextSelection(6));
    expect(screen.queryByTestId('ai-selection-assistant')).not.toBeInTheDocument();
  });
});

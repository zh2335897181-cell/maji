import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor as EditorType } from '@tiptap/react';
import { AICompletionAssistant } from './AICompletionAssistant';

let editor: Editor;
let host: HTMLDivElement;
const ai = {
  ask: vi.fn().mockResolvedValue({ kind: 'text', text: '，它可以复用逻辑。' }),
};

function setup(content: string) {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: [StarterKit], content });
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 80, bottom: 100, left: 120, right: 124 });
  Object.defineProperty(window, 'maji', { configurable: true, value: { ai } });
  render(<AICompletionAssistant editor={editor as unknown as EditorType} editable language="text" onOpenSettings={() => undefined} />);
}

function triggerCompletion() {
  act(() => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', {
    key: ' ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('maji.ai.consent.v1', '1');
  vi.clearAllMocks();
  ai.ask.mockResolvedValue({ kind: 'text', text: '，它可以复用逻辑。' });
});

afterEach(() => {
  cleanup();
  if (editor && !editor.isDestroyed) editor.destroy();
  host?.remove();
  Object.defineProperty(window, 'maji', { configurable: true, value: undefined });
});

describe('AI contextual completion', () => {
  it('sends nearby prose and inserts the suggestion only after Tab', async () => {
    setup('<p>函数可以</p>');
    act(() => editor.commands.setTextSelection(5));
    triggerCompletion();

    await waitFor(() => expect(ai.ask).toHaveBeenCalledWith('continue', expect.objectContaining({
      scope: 'completion', language: 'text',
      continuation: { before: '函数可以', after: '', code: false },
    })));
    expect(screen.getByText('，它可以复用逻辑。')).toBeInTheDocument();
    expect(editor.getText()).toBe('函数可以');
    act(() => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(editor.getText()).toBe('函数可以，它可以复用逻辑。');
  });

  it('includes the active code block language in the continuation context', async () => {
    setup('<pre><code class="language-python">def add(a, b):\n    </code></pre>');
    act(() => editor.commands.setTextSelection(editor.state.doc.content.size - 1));
    triggerCompletion();

    await waitFor(() => expect(ai.ask).toHaveBeenCalledWith('continue', expect.objectContaining({
      continuation: expect.objectContaining({ code: true }),
    })));
  });

  it('uses nearby note paragraphs around the cursor as extra continuation context', async () => {
    setup('<p>概念介绍</p><p>函数可以</p><p>接收参数</p>');
    act(() => editor.commands.setTextSelection(9));
    triggerCompletion();

    await waitFor(() => expect(ai.ask).toHaveBeenCalledWith('continue', expect.objectContaining({
      continuation: { before: '概念介绍\n函数', after: '可以\n接收参数', code: false },
    })));
  });

  it('dismisses a suggestion with Escape without editing the note', async () => {
    setup('<p>函数可以</p>');
    act(() => editor.commands.setTextSelection(5));
    triggerCompletion();
    await screen.findByText('，它可以复用逻辑。');
    act(() => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(editor.getText()).toBe('函数可以');
    expect(screen.queryByText('，它可以复用逻辑。')).not.toBeInTheDocument();
  });

  it('asks before sending note context to the configured AI service on first use', async () => {
    localStorage.removeItem('maji.ai.consent.v1');
    setup('<p>函数可以</p>');
    act(() => editor.commands.setTextSelection(5));
    triggerCompletion();

    expect(await screen.findByText(/光标所在段落的前后内容会发送到/)).toBeInTheDocument();
    expect(ai.ask).not.toHaveBeenCalled();
    act(() => screen.getByRole('button', { name: '我已了解，继续' }).click());
    await waitFor(() => expect(ai.ask).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('maji.ai.consent.v1')).toBe('1');
  });

  it('discards an in-flight completion when the note changes', async () => {
    let resolve: ((value: { kind: 'text'; text: string }) => void) | undefined;
    ai.ask.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    setup('<p>函数可以</p>');
    act(() => editor.commands.setTextSelection(5));
    triggerCompletion();
    await waitFor(() => expect(ai.ask).toHaveBeenCalledTimes(1));
    act(() => editor.commands.insertContentAt(3, '复用'));
    await act(async () => { resolve?.({ kind: 'text', text: '旧建议' }); });

    expect(editor.getText()).toBe('函数复用可以');
    expect(screen.queryByText('旧建议')).not.toBeInTheDocument();
  });

  it('shows why continuation is unavailable in an empty paragraph', () => {
    setup('<p></p>');
    act(() => editor.commands.setTextSelection(1));
    triggerCompletion();
    expect(screen.getByRole('alert')).toHaveTextContent('先在当前段落写一点内容');
    expect(ai.ask).not.toHaveBeenCalled();
  });
});

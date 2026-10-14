import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
afterEach(() => vi.useRealTimers());
function Form() {
  const [value, setValue] = useState(''), [open, setOpen] = useState(true);
  return <Modal open={open} title="测试" onClose={() => setOpen(false)}><input aria-label="日期"/><input aria-label="标题" value={value} onChange={e => setValue(e.target.value)}/><button onClick={() => setValue('更新')}>更新</button></Modal>;
}
it('keeps focus and caret when the parent rerenders during typing', () => {
  vi.useFakeTimers(); render(<Form/>); act(() => vi.runAllTimers());
  const title=screen.getByLabelText('标题') as HTMLInputElement;
  title.focus(); fireEvent.change(title,{target:{value:'a'}}); act(() => vi.runAllTimers());
  expect(document.activeElement).toBe(title);
  expect(title.selectionStart).toBe(1);
});
it('keeps composition focus and does not close on IME Escape', () => {
  vi.useFakeTimers(); render(<Form/>); act(() => vi.runAllTimers());
  const title=screen.getByLabelText('标题'); title.focus();
  fireEvent.compositionStart(title); fireEvent.change(title,{target:{value:'zhong'}}); act(() => vi.runAllTimers());
  expect(document.activeElement).toBe(title);
  fireEvent.keyDown(title,{key:'Escape',isComposing:true,keyCode:229});
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.compositionEnd(title,{data:'中文'});fireEvent.change(title,{target:{value:'中文'}});
  act(() => vi.runAllTimers()); expect(document.activeElement).toBe(title);
  fireEvent.keyDown(title,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});

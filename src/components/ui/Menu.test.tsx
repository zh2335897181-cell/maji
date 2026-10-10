import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MoreHorizontal } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('escapes clipping ancestors and keeps portal actions clickable', () => {
  const select = vi.fn();
  const { container } = render(<div style={{ overflow: 'hidden' }}><Menu label="更多" icon={MoreHorizontal} items={[{ id: 'open', label: '打开笔记', onSelect: select }]} /></div>);
  fireEvent.click(screen.getByRole('button', { name: '更多' }));
  const menu = screen.getByRole('menu');
  expect(container.contains(menu)).toBe(false);
  expect(menu.parentElement).toBe(document.body);
  fireEvent.mouseDown(screen.getByRole('menuitem'));
  fireEvent.click(screen.getByRole('menuitem'));
  expect(select).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).toBeNull();
});

it('flips above a bottom-edge trigger and closes on outside click', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return (this.getAttribute('role') === 'menu'
      ? { left: 0, top: 0, right: 220, bottom: 100, width: 220, height: 100 }
      : { left: 900, top: 730, right: 950, bottom: 760, width: 50, height: 30 }) as DOMRect;
  });
  render(<Menu label="更多" icon={MoreHorizontal} items={[{ id: 'open', label: '打开笔记', onSelect: vi.fn() }]} />);
  fireEvent.click(screen.getByRole('button', { name: '更多' }));
  expect(screen.getByRole('menu').style.top).toBe('626px');
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('menu')).toBeNull();
});

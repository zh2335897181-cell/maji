import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BackupSettings } from './BackupSettings';
afterEach(()=>{cleanup();delete window.maji;});
it('shows desktop-only help in browser',()=>{render(<BackupSettings/>);expect(screen.getByText(/桌面版/)).toBeVisible();});
it('previews before restoring and preserves errors for retry',async()=>{
  const restore=vi.fn().mockRejectedValue(new Error('安全备份写入失败'));
  window.maji={backup:{status:async()=>({enabled:true,lastSuccessAt:null,directory:'test',error:null,files:[]}),preview:async()=>({token:'test',createdAt:'2026-10-11T00:00:00Z',appVersion:'0.5.6',schemaVersion:6,counts:{notes:3}}),restore}} as never;
  render(<BackupSettings/>);
  await screen.findByText('尚无成功备份');
  fireEvent.click(screen.getByRole('button',{name:'从文件恢复'}));
  await screen.findByText('笔记：3');expect(restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'确认整体恢复'}));
  await waitFor(()=>expect(restore).toHaveBeenCalledWith('test'));
  expect(await screen.findByRole('alert')).toHaveTextContent('安全备份写入失败');
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpdateSettings } from './UpdateSettings';

describe('UpdateSettings', () => {
  it('explains when this build has no update feed and keeps check disabled', () => {
    render(<UpdateSettings status={{ state: 'unsupported', currentVersion: '0.1.0', message: '此安装包尚未配置 GitHub 更新源。' }} onCheck={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByText('此安装包尚未配置 GitHub 更新源。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /检查更新/ })).toBeDisabled();
  });

  it('shows download progress and the rounded percent', () => {
    render(<UpdateSettings status={{ state: 'downloading', currentVersion: '0.1.0', version: '0.2.0', percent: 42.6 }} onCheck={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: '更新下载进度' })).toHaveAttribute('value', '42.6');
    expect(screen.getByText('43%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /检查更新/ })).toBeDisabled();
  });

  it('offers installation only after download completes', () => {
    const onInstall = vi.fn();
    render(<UpdateSettings status={{ state: 'downloaded', currentVersion: '0.1.0', version: '0.2.0' }} onCheck={vi.fn()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: /立即重启并安装/ }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('allows retry after a check error', () => {
    const onCheck = vi.fn();
    render(<UpdateSettings status={{ state: 'error', currentVersion: '0.1.0', message: '检查或下载更新失败，请检查网络后重试。' }} onCheck={onCheck} onInstall={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }));
    expect(onCheck).toHaveBeenCalledOnce();
  });
});

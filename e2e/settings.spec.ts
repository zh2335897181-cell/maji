import { expect, test } from '@playwright/test';
test('主题即时切换且刷新后保留', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button',{name:'小林（用户菜单）'}).click();
  await page.getByRole('menuitem',{name:'切换到深色主题'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'小林（用户菜单）'}).click();
  await page.getByRole('menuitem',{name:'切换到浅色主题'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
test('设置分开显示，AI 设置事件直接定位服务', async ({ page }) => {
  await page.goto('/#/');
  for (const name of ['外观与编辑','AI 服务','数据与备份','应用更新']) {
    await page.getByRole('button',{name:'小林（用户菜单）'}).click();
    await page.getByRole('menuitem',{name,exact:true}).click();
    const dialog=page.getByRole('dialog',{name,exact:true});await expect(dialog).toBeVisible();
    if(name==='外观与编辑') {
      await expect(dialog.getByLabel('编辑器正文字号')).toBeVisible();
      await expect(dialog.getByRole('region',{name:'AI 服务'})).toHaveCount(0);
      await expect(dialog.getByRole('button',{name:'检查更新'})).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('maji:open-ai-settings')));
  await expect(page.getByRole('dialog',{name:'AI 服务',exact:true})).toBeVisible();
});

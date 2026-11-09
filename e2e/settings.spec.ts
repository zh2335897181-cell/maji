import { expect, test } from '@playwright/test';
test('悬浮窗透明度滑块可调节且刷新后保留',async({page})=>{
 await page.goto('/#/');await page.getByRole('button',{name:'小林（用户菜单）'}).click();await page.getByRole('menuitem',{name:'外观与编辑',exact:true}).click();
 const slider=page.getByRole('slider',{name:'悬浮窗透明度',exact:true});await expect(slider).toHaveValue('100');await slider.focus();await slider.press('Home');await slider.press('ArrowRight');await expect(slider).toHaveValue('11');await expect(page.getByRole('dialog')).toContainText('11% 不透明');
 await page.reload();await page.getByRole('button',{name:'小林（用户菜单）'}).click();await page.getByRole('menuitem',{name:'外观与编辑',exact:true}).click();await expect(page.getByRole('slider',{name:'悬浮窗透明度',exact:true})).toHaveValue('11');
});
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

test('主题色板和正文排版即时生效并在刷新后保留', async ({ page }) => {
  await page.goto('/#/');
  const openAppearance = async () => {
    await page.getByRole('button', { name: '小林（用户菜单）' }).click();
    await page.getByRole('menuitem', { name: '外观与编辑', exact: true }).click();
  };
  await openAppearance();
  const html = page.locator('html');
  const appearance = page.getByRole('dialog', { name: '外观与编辑' });
  const originalBackground = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
  await appearance.getByRole('radio', { name: '纸感米白' }).check();
  await expect(html).toHaveAttribute('data-theme', 'paper');
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(originalBackground);
  await appearance.getByLabel('编辑器正文字体').selectOption('serif');
  await appearance.getByLabel('编辑器正文字号').selectOption('18');
  await expect(html).toHaveAttribute('data-editor-font', 'serif');
  await expect(html).toHaveCSS('--editor-font-size', '18px');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'paper');
  await expect(html).toHaveAttribute('data-editor-font', 'serif');
  await expect(html).toHaveCSS('--editor-font-size', '18px');
});

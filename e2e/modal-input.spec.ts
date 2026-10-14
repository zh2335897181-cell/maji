import { expect, test } from '@playwright/test';
test('晨考弹窗连续输入不会跳回日期，中文组合输入保持焦点', async ({ page }) => {
  await page.goto('/#/morning');
  await page.getByRole('button',{name:'新增晨考',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'新增晨考'}), title=dialog.getByLabel('标题',{exact:true});
  await title.click(); await title.pressSequentially('Spring IOC',{delay:60});
  await expect(title).toHaveValue('Spring IOC');await expect(title).toBeFocused();
  await title.dispatchEvent('compositionstart',{data:''});
  await title.evaluate((node:HTMLInputElement)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,'Spring IOC 中文输入');
    node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'中文输入',isComposing:true}));
  });
  await page.waitForTimeout(100);await expect(title).toBeFocused();
  await title.dispatchEvent('compositionend',{data:'中文输入'});
  await expect(title).toHaveValue('Spring IOC 中文输入');
});

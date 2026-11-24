import { expect, test } from '@playwright/test';

test('the route artwork and tools work on desktop, tablet and mobile', async ({page}) => {
  const errors:string[]=[];
  page.on('response', response => { if(response.status()>=400)errors.push(response.url()); });
  await page.goto('./');
  for (const width of [1440,768,390]) {
    await page.setViewportSize({width,height:width===390?844:900});
    await expect(page.locator('#connect')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const cards=page.locator('.chapter-card');
    for (let i=0;i<3;i++) {
      await expect(cards.nth(i)).toBeInViewport();
      await cards.nth(i).click();
      await expect(page.locator('.dialog-art')).toHaveJSProperty('complete',true);
      expect(await page.locator('.dialog-art').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
      await page.locator('#dialog-close').click();
    }
  }
  await page.locator('#guide').click();
  await expect(page.getByText('倒木前放慢踏頻')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
  await page.locator('#settings').click();
  await page.locator('#reference').fill('72');
  await page.locator('#quality').selectOption('low');
  await page.locator('#reduced').check();
  await page.getByRole('button',{name:'儲存設定'}).click();
  await page.reload();await page.locator('#settings').click();
  await expect(page.locator('#reference')).toHaveValue('72');
  await expect(page.locator('#quality')).toHaveValue('low');
  await expect(page.locator('#reduced')).toBeChecked();
  await page.locator('#dialog-close').click();
  expect(errors).toEqual([]);
});

test('a tablet can ride at low quality, rest at zero cadence and rotate while paused', async ({page}, info) => {
  await page.setViewportSize({width:768,height:1024});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.locator('#settings').click();
  await page.locator('#quality').selectOption('low');
  await expect(page.locator('#reduced')).toBeChecked();
  await page.getByRole('button',{name:'儲存設定'}).click();
  await page.locator('#demo').click();
  await expect(page.locator('#speed')).toHaveText('30',{timeout:15000});
  await page.locator('#rpm-control').fill('90');
  await expect(page.locator('#speed')).toHaveText('45');
  await expect(page.locator('#pause')).toBeInViewport();
  await expect(page.locator('#rpm-control')).toBeInViewport();
  await page.screenshot({path:process.env.UPDATE_GAME_IMAGES === '1'?'docs/images/ride-tablet.png':info.outputPath('ride-tablet.png')});
  await page.locator('#rpm-control').fill('0');
  await expect(page.locator('#speed')).toHaveText('0');
  await expect(page.locator('#cue-title')).toHaveText('踩踏即可前進');
  await page.locator('#pause').click();
  await page.setViewportSize({width:1024,height:768});
  await expect(page.locator('#begin')).toBeInViewport();
  await page.locator('#begin').click();
  await page.locator('#rpm-control').fill('60');
  await expect(page.locator('#rpm')).toHaveText('60');
  await expect(page.locator('#speed')).toHaveText('30');
});

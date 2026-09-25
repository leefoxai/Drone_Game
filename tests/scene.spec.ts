import { expect, test } from '@playwright/test';

test('3D 훈련장을 렌더링하고 화면 크기 변경에 대응한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  const scene = page.locator('#scene');
  await expect(scene).toHaveAttribute('data-rendered', 'true');
  await expect(scene).toBeVisible();

  // Confirm a real GPU context in addition to the rendered UI.
  const contextWorks = await scene.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    return gl !== null && !gl.isContextLost() && gl.drawingBufferWidth > 0;
  });
  expect(contextWorks).toBe(true);
  await page.screenshot({ path: 'test-results/flight-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => scene.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    bufferWidth: (element as HTMLCanvasElement).width,
  }))).toEqual({ width: 390, height: 844, bufferWidth: 390 });
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await page.screenshot({ path: 'test-results/flight-mobile.png' });
  expect(errors).toEqual([]);
});

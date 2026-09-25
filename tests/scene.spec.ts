import { expect, test } from '@playwright/test';

test('3D 훈련장을 렌더링하고 높이 단서·그림자·화면 크기 변경을 확인한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  const scene = page.locator('#scene');
  await expect(scene).toHaveAttribute('data-rendered', 'true');
  await expect(scene).toHaveAttribute('data-real-shadows','true');
  await expect(scene).toHaveAttribute('data-gate-legs','10');
  await expect(scene).toHaveAttribute('data-ground-markers','5');
  await expect(scene).toHaveAttribute('data-scale-cones','4');
  await expect(scene).toHaveAttribute('data-scale-flags','2');
  expect(await scene.getAttribute('data-drone-visual-radius')).toBe(await scene.getAttribute('data-drone-collision-radius'));
  expect(await scene.getAttribute('data-gate-frame-thickness')).toBe('0.22');
  await expect(scene).toBeVisible();

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

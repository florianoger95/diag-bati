import { expect, it } from 'vitest';

it('s’exécute dans WebKit avec canvas et createImageBitmap', () => {
  expect(navigator.userAgent).toContain('AppleWebKit');
  expect(typeof document.createElement('canvas').toBlob).toBe('function');
  expect(typeof createImageBitmap).toBe('function');
});

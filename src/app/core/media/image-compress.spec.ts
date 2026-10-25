import { describe, expect, it } from 'vitest';
import { fitSize } from './image-compress';

describe('fitSize', () => {
  it('ramène le côté long à la limite en gardant les proportions', () => {
    expect(fitSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('n’agrandit jamais une petite image', () => {
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('garde au moins 1 pixel sur les formats extrêmes', () => {
    expect(fitSize(20000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

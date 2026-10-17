import type { SkPathBuilder } from 'react-native-skia';
import { createSkiaPathContext } from '../components/globe/shared';

function target() {
  const calls: unknown[][] = [];
  const path = {
    moveTo: step('move'),
    lineTo: step('line'),
    conicTo: step('conic'),
    addArc: step('arc'),
    close: step('close'),
  };
  function step(name: string) {
    return function (this: unknown, ...args: unknown[]) {
      if (this !== path) throw new Error('Path method lost its native receiver');
      calls.push([name, ...args]);
      return path;
    };
  }
  return { path: path as unknown as SkPathBuilder, calls };
}

it('ignores commands until a path is selected', () => {
  const context = createSkiaPathContext();
  expect(() => {
    context.beginPath();
    context.moveTo(1, 2);
    context.lineTo(3, 4);
    context.conicTo(1, 2, 3, 4, 0.5);
    context.arc(10, 20, 5, 0, Math.PI);
    context.closePath();
    context.close();
  }).not.toThrow();
});

it('retargets every command and preserves the native receiver', () => {
  const context = createSkiaPathContext();
  const first = target();
  const second = target();
  context.setPath(first.path);
  context.moveTo(1, 2);
  context.lineTo(3, 4);
  context.close();
  context.setPath(second.path);
  context.moveTo(5, 6);
  context.lineTo(7, 8);
  context.conicTo(9, 10, 11, 12, 0.5);
  context.arc(10, 20, 5, Math.PI / 2, Math.PI);
  context.closePath();
  context.close();
  expect(first.calls).toEqual([['move', 1, 2], ['line', 3, 4], ['close']]);
  expect(second.calls).toEqual([
    ['move', 5, 6],
    ['line', 7, 8],
    ['conic', 9, 10, 11, 12, 0.5],
    ['arc', { x: 5, y: 15, width: 10, height: 10 }, 90, 90],
    ['close'],
    ['close'],
  ]);
  context.setPath(first.path);
  context.lineTo(13, 14);
  expect(first.calls.at(-1)).toEqual(['line', 13, 14]);
  expect(second.calls).toHaveLength(6);
});

it('keeps independent contexts aimed at their own paths', () => {
  const a = createSkiaPathContext();
  const b = createSkiaPathContext();
  const first = target();
  const second = target();
  a.setPath(first.path);
  b.setPath(second.path);
  a.lineTo(1, 2);
  b.lineTo(3, 4);
  expect(first.calls).toEqual([['line', 1, 2]]);
  expect(second.calls).toEqual([['line', 3, 4]]);
});

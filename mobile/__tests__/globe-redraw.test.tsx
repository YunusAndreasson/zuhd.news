import { renderHook } from '@testing-library/react';
import { useGlobeRedraw } from '../hooks/useGlobeRedraw';

it('redraws when disasters or conflicts alone arrive or disappear on a stationary map', () => {
  const draw = jest.fn();
  const initial = { alerts: [] as string[], conflicts: [] as string[], camera: [50, 20] };
  const { rerender } = renderHook(({ inputs }) => useGlobeRedraw(inputs, draw), {
    initialProps: { inputs: initial },
  });
  expect(draw).toHaveBeenCalledTimes(1);
  const alerts = { ...initial, alerts: ['flood'] };
  rerender({ inputs: alerts });
  const conflicts = { ...alerts, conflicts: ['event'] };
  rerender({ inputs: conflicts });
  rerender({ inputs: initial });
  expect(draw).toHaveBeenCalledTimes(4);
});

it('coalesces several changed layers and viewport bounds into one redraw per commit', () => {
  const draw = jest.fn();
  const initial = { alerts: [] as string[], conflicts: [] as string[], top: 80, bottom: 500 };
  const { rerender } = renderHook(({ inputs }) => useGlobeRedraw(inputs, draw), {
    initialProps: { inputs: initial },
  });
  const updated = { alerts: ['flood'], conflicts: ['event'], top: 180, bottom: 500 };
  rerender({ inputs: updated });
  expect(draw).toHaveBeenCalledTimes(2);
  rerender({ inputs: { ...updated } });
  expect(draw).toHaveBeenCalledTimes(2);
  rerender({ inputs: { ...updated, top: 80 } });
  expect(draw).toHaveBeenCalledTimes(3);
});

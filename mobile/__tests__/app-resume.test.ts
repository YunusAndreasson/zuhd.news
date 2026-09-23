import { renderHook } from '@testing-library/react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppResume } from '../hooks/useAppResume';

let change: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.mocked(AppState.addEventListener).mockImplementation((_event, callback) => {
    change = callback as typeof change;
    return { remove: jest.fn() } as never;
  });
});

it('reports how long the app was away, and only past the threshold', () => {
  const now = jest.spyOn(Date, 'now');
  const onResume = jest.fn();
  renderHook(() => useAppResume(onResume, 5 * 60_000));

  now.mockReturnValue(1_000_000);
  change('background');
  now.mockReturnValue(1_000_000 + 2 * 60_000);
  change('active');
  expect(onResume).not.toHaveBeenCalled();

  change('background');
  now.mockReturnValue(1_000_000 + 2 * 60_000 + 90 * 60_000);
  change('active');
  // Where the reader lands depends on it (`resumeLanding`).
  expect(onResume).toHaveBeenCalledWith(90 * 60_000);
  now.mockRestore();
});

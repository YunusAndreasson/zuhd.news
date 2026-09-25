import { chooserTitle } from '../lib/chooser-title';

test('names the kind when every mark under the finger is one', () => {
  expect(chooserTitle(['market', 'market', 'market'])).toBe('3 exchanges here');
  expect(chooserTitle(['conflict', 'conflict'])).toBe('2 conflict events here');
  expect(chooserTitle(['chokepoint', 'chokepoint'])).toBe('2 straits here');
});

test('calls a mixed handful marks, the map key’s word', () => {
  expect(chooserTitle(['market', 'chokepoint', 'gdacs'])).toBe('3 marks here');
  expect(chooserTitle(['hotspot', 'hotspot'])).toBe('2 marks here');
});

test('counts in the singular when a row was dropped down to one', () => {
  expect(chooserTitle(['gdacs'])).toBe('1 hazard here');
});

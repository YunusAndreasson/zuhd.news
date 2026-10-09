import {
  capitalsInView,
  getRestingView,
  isGlobeResting,
  markGlobeMoving,
  marksInView,
  publishRestingView,
  subscribeRestingView,
} from '../lib/resting-view';

const band = { width: 400, top: 150, bottom: 650 };
const city = (id: string, x = 200, y = 400) => ({ id, x, y });

it('splits the markets by whether their week is printed: a lone name, or a count and a name that found no room', () => {
  expect(
    marksInView(
      [
        { ids: ['mkt:named'], labelY: 300 },
        { ids: ['mkt:dropped'], labelY: null },
        // A cluster's count is a label, and still names none of its members.
        { ids: ['mkt:paris', 'mkt:milan'], labelY: 320 },
        { ids: ['mkt:zurich', 'mkt:frankfurt'], labelY: null },
      ],
      ['mkt:named', 'mkt:dropped', 'mkt:paris', 'mkt:milan', 'mkt:zurich', 'mkt:frankfurt'].map(
        (id) => city(id),
      ),
      [],
      band,
    ),
  ).toEqual({
    named: ['mkt:named'],
    unnamed: ['mkt:dropped', 'mkt:frankfurt', 'mkt:milan', 'mkt:paris', 'mkt:zurich'],
  });
});
it("counts a cluster's member only where its own city is in view", () => {
  // Milan at the left edge of a map of the Gulf, in a count set down near Cairo.
  expect(
    marksInView(
      [{ ids: ['mkt:cairo', 'mkt:milan'], labelY: 320 }],
      [city('mkt:cairo', 120, 400), city('mkt:milan', 4, 300)],
      [],
      band,
    ).unnamed,
  ).toEqual(['mkt:cairo']);
});
it('names a strait with its label down, and counts an unnamed one only inside the band the chrome leaves', () => {
  const strait = (id: string, x: number, y: number, labelY: number | null = null) => ({
    id,
    x,
    y,
    labelY,
  });
  expect(
    marksInView(
      [],
      [],
      [
        strait('quiet', 200, 400),
        strait('named', 200, 420, 440),
        strait('under-header', 200, 100),
        strait('under-sheet', 200, 700),
        strait('off-left', -10, 400),
        strait('off-right', 410, 400),
        // On the canvas, and cut by its edge.
        strait('at-the-edge', 390, 400),
        strait('under-the-header-rule', 200, 160),
      ],
      band,
    ),
  ).toEqual({ named: ['strait-named'], unnamed: ['strait-quiet'] });
});
it('counts a country by its capital, inside the band the chrome leaves', () => {
  expect(
    capitalsInView(
      [
        { iso2: 'TR', x: 300, y: 400 },
        { iso2: 'DE', x: 100, y: 200 },
        { iso2: 'EG', x: 300, y: 700 },
        { iso2: 'ES', x: -5, y: 400 },
        { iso2: 'RU', x: 200, y: 100 },
        // Moscow a hair inside the right edge of a map centred on Madrid.
        { iso2: 'BY', x: 395, y: 300 },
      ],
      band,
    ),
  ).toEqual(['DE', 'TR']);
});
it('tells its listeners only when the view changed, and keeps a list that did not', () => {
  const heard = jest.fn();
  const unsubscribe = subscribeRestingView(heard);
  publishRestingView({ named: [], unnamed: ['mkt:a'], countries: ['TR'] });
  const first = getRestingView();
  publishRestingView({ named: [], unnamed: ['mkt:a'], countries: ['TR'] });
  expect(heard).toHaveBeenCalledTimes(1);
  expect(getRestingView()).toBe(first);
  publishRestingView({ named: [], unnamed: ['mkt:a'], countries: ['DE', 'TR'] });
  expect(heard).toHaveBeenCalledTimes(2);
  expect(getRestingView().unnamed).toBe(first.unnamed);
  expect(getRestingView().countries).toEqual(['DE', 'TR']);
  publishRestingView({ named: ['strait-hormuz'], unnamed: ['mkt:a'], countries: ['DE', 'TR'] });
  expect(heard).toHaveBeenCalledTimes(3);
  expect(getRestingView().named).toEqual(['strait-hormuz']);
  // Coming to rest is news even over the same view: a settle that was put off
  // while the globe moved is waiting for it.
  markGlobeMoving();
  expect(isGlobeResting()).toBe(false);
  publishRestingView({ named: ['strait-hormuz'], unnamed: ['mkt:a'], countries: ['DE', 'TR'] });
  expect(isGlobeResting()).toBe(true);
  expect(heard).toHaveBeenCalledTimes(4);
  unsubscribe();
  publishRestingView({ named: [], unnamed: [], countries: [] });
  expect(heard).toHaveBeenCalledTimes(4);
});

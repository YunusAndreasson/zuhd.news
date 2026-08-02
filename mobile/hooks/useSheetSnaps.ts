import { useMemo } from 'react';

type SnapConfig = {
  enableDynamicSizing: boolean;
};

/**
 * Bottom-sheet snap configuration — one mode, for every sheet, always.
 *
 * `tall` is still accepted so call sites keep documenting which pages are
 * long ones, but it deliberately does not change the result, and that is the
 * whole point of this hook now: **a sheet's sizing mode must not change while
 * it is presented.**
 *
 * It used to. `tall` returned `{ snapPoints: ['85%'], enableDynamicSizing:
 * false }` and short pages returned dynamic sizing, so opening a sub-page —
 * a country's AREA ranking, or menu → search — flipped the mode mid-flight.
 * On iOS that closed the sheet outright. `@expo/ui`'s `BottomSheetModal` pins
 * `index={-1}` for its whole life, and its iOS effect reads
 *
 *     useEffect(() => {
 *       if (indexProp === -1) { setIsPresented(false); fireCloseCallbacks(); }
 *     }, [indexProp, detents.length, fireCloseCallbacks]);
 *
 * so *any* re-run of that effect dismisses the sheet, and `detents.length` is
 * one of its dependencies — 2 for content-sized (`['medium','large']`), 1 for
 * a single `'85%'` snap point. Tapping the row changed the length, the effect
 * re-ran, and the sheet vanished instead of pushing the page.
 *
 * Android never showed it: its equivalent effect depends on `clampIndex`,
 * which is keyed on `maxIndex` — `0` in both modes — so the identity held and
 * the effect never re-ran. A bug that reproduces on one platform only because
 * the other one's dependency array happens to be stable is not a bug worth
 * keeping a clever workaround for; the mode is now simply constant.
 *
 * Height comes from `LAYOUT.sheetMaxFraction` in `SheetLayout` instead. Short
 * pages still hug their content; long ones grow to the cap and scroll inside
 * it, which is what the fixed 85% snap was buying.
 *
 * Spread the result into a `<SheetLayout>`.
 */
export function useSheetSnaps(_tall: boolean): SnapConfig {
  return useMemo<SnapConfig>(() => ({ enableDynamicSizing: true }), []);
}

import { afterwards } from '../lib/afterwards';

// `try…finally`, as a function: a component that holds the statement itself is
// skipped by React Compiler (`react-compiler.test.ts`).
describe('afterwards', () => {
  it('runs the second after the first has settled, and hands on its answer', async () => {
    const order: string[] = [];
    const answer = await afterwards(
      async () => {
        await Promise.resolve();
        order.push('work');
        return 7;
      },
      () => order.push('after'),
    );
    expect(answer).toBe(7);
    expect(order).toEqual(['work', 'after']);
  });

  it('runs the second when the first throws, and throws what it threw', async () => {
    const after = jest.fn();
    const failure = new Error('refused');
    await expect(afterwards(() => Promise.reject(failure), after)).rejects.toBe(failure);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('runs the second when the first throws before it returns a promise', async () => {
    const after = jest.fn();
    await expect(
      afterwards(() => {
        throw new Error('at once');
      }, after),
    ).rejects.toThrow('at once');
    expect(after).toHaveBeenCalledTimes(1);
  });
});

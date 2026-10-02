import { expect, test } from 'vitest';
import { registry } from './machines';
import { deserializeGraph, serializeGraph } from './graph';
import { Simulation } from './simulation';
import { FactoryBuilder } from './test-factories';
import type { DataValue } from './types';

const cases: { type: string; input: DataValue; expected: DataValue; config?: Record<string, DataValue> }[] = [
  { type: 'negate', input: -7, expected: 7 },
  { type: 'abs', input: -2.5, expected: 2.5 },
  { type: 'not', input: false, expected: true },
  { type: 'not', input: true, expected: false },
  { type: 'length', input: '🚀АБ', expected: 3 },
  { type: 'length', input: [1, [2, 3]], expected: 2 },
  { type: 'length', input: '', expected: 0 },
  { type: 'sum', input: [4, -2, 0.5], expected: 2.5 },
  { type: 'sum', input: [], expected: 0 },
  { type: 'sort', input: [10, 2, -1, 2], expected: [-1, 2, 2, 10] },
  { type: 'sort', input: [10, 2, -1], expected: [10, 2, -1], config: { order: 'descending' } },
  { type: 'sort', input: [], expected: [] },
  { type: 'unique', input: [1, true, [1], [1], '1', 1, true], expected: [1, true, [1], '1'] },
  { type: 'unique', input: [], expected: [] },
];
test.each(cases)('$type transforms $input and survives graph serialization', ({ type, input, expected, config }) => {
  const graph = new FactoryBuilder().add('s', 'source').add('n', type, config).add('o', 'output').wire('s', 'n').wire('n', 'o').graph;
  const run = new Simulation(deserializeGraph(serializeGraph(graph)), input).run();
  expect(run.error).toBeUndefined(); expect(run.output).toEqual([expected]);
});

test('concat broadcasts a suffix over a stream and handles an empty stream', () => {
  const graph = new FactoryBuilder().add('s', 'source').add('split', 'split').add('suffix', 'constant', { value: '!' }).add('n', 'concat').add('o', 'output')
    .wire('s', 'split').wire('split', 'n', 'a').wire('suffix', 'n', 'b').wire('n', 'o').graph;
  expect(new Simulation(graph, ['A', 'B']).run().output).toEqual(['A!', 'B!']);
  expect(new Simulation(graph, []).run().output).toEqual([]);
});

test.each(['negate', 'abs', 'not', 'length', 'sum', 'sort', 'unique'])('%s emits no packets for an empty input stream', type => {
  const graph = new FactoryBuilder().add('s', 'source').add('split', 'split').add('n', type).add('o', 'output').wire('s', 'split').wire('split', 'n').wire('n', 'o').graph;
  const run = new Simulation(graph, []).run(); expect(run.error).toBeUndefined(); expect(run.output).toEqual([]);
});

test.each(['sum', 'sort'])('%s rejects nonnumeric array members', type => {
  const graph = new FactoryBuilder().add('s', 'source').add('n', type).add('o', 'output').wire('s', 'n').wire('n', 'o').graph;
  expect(new Simulation(graph, [1, true]).run().error).toContain('число');
});

test('not rejects truthy numbers and sum rejects overflow', () => {
  const graph = new FactoryBuilder().add('s', 'source').add('n', 'not').add('o', 'output').wire('s', 'n').wire('n', 'o').graph;
  expect(new Simulation(graph, 1).run().error).toContain('boolean');
  graph.machines[1].type = 'sum';
  expect(new Simulation(graph, [Number.MAX_VALUE, Number.MAX_VALUE]).run().error).toContain('недопустимое');
});

test('array transformations preserve their input', () => {
  for (const type of ['sort', 'unique']) {
    const values: DataValue[] = [3, 1, 3], definition = registry.get(type);
    definition.execute({ input: 0, inputs: { in: [values] }, config: definition.defaults, connected: new Set(['in']), memory: {} });
    expect(values).toEqual([3, 1, 3]);
  }
});

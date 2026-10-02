import { afterEach, expect, test, vi } from 'vitest';
import { randomChoice, randomInteger, randomRange, randomSample, randomShuffle, randomUniform } from './random';
import { configurationError, registry } from './machines';
import { deserializeGraph, serializeGraph } from './graph';
import { Simulation } from './simulation';
import { FactoryBuilder } from './test-factories';
import { examples } from '../content/examples';
import type { DataValue } from './types';

afterEach(() => vi.restoreAllMocks());

test('integer bounds are inclusive and ranges respect stop and negative steps', () => {
  const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
  expect(randomInteger(-2, 6)).toBe(-2);
  expect(randomRange(10, 0, -3)).toBe(10);
  rng.mockReturnValue(1 - Number.EPSILON);
  expect(randomInteger(-2, 6)).toBe(6);
  expect(randomInteger(4, 4)).toBe(4);
  expect(randomRange(10, 0, -3)).toBe(1);
  expect(randomRange(0, 10, 3)).toBe(9);
});

test('uniform accepts equal and reversed bounds', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  expect(randomUniform(-2, 2)).toBe(-1);
  expect(randomUniform(2, -2)).toBe(1);
  expect(randomUniform(7, 7)).toBe(7);
});

test('choice handles Unicode and rejects empty sequences', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  expect(randomChoice('🚀A')).toBe('🚀');
  expect(randomChoice([[1, 2]])).toEqual([1, 2]);
  expect(() => randomChoice([])).toThrow('пустой');
  expect(() => randomChoice('')).toThrow('пустой');
});

test('shuffle and sample preserve input and sample positions without replacement', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const input = [1, 2, 3, 4];
  const shuffled = randomShuffle(input);
  expect(shuffled).not.toBe(input); expect([...shuffled].sort()).toEqual(input);
  const sample = randomSample(input, 3);
  expect(sample).toHaveLength(3); expect(new Set(sample).size).toBe(3);
  expect(input).toEqual([1, 2, 3, 4]);
  expect(randomSample(['A', 'A'], 2)).toEqual(['A', 'A']);
  expect(randomSample('🚀A', 2).sort()).toEqual(['🚀', 'A'].sort());
  expect(randomShuffle([])).toEqual([]); expect(randomSample([], 0)).toEqual([]);
  expect(() => randomSample([], 1)).toThrow('длину');
});

test.each([
  ['randint', { min: 2, max: 1 }], ['randint', { min: 1.5, max: 6 }],
  ['randint', { min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }],
  ['randrange', { start: 0, stop: 5, step: 0 }], ['randrange', { start: 0, stop: 5, step: -1 }],
  ['uniform', { a: '0', b: 1 }], ['uniform', { a: -Number.MAX_VALUE, b: Number.MAX_VALUE }],
  ['sample', { k: -1 }], ['sample', { k: 1.5 }],
] as [string, Record<string, DataValue>][])('%s rejects invalid settings on edit/import', (type, config) => {
  const graph = new FactoryBuilder().add('n', type, config).graph;
  expect(configurationError(graph.machines[0])).toBeTruthy();
  expect(() => deserializeGraph(serializeGraph(graph))).toThrow();
});

test.each(['random', 'randint', 'randrange', 'uniform'])('%s generates once per trigger and never on validation', type => {
  const rng = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const graph = new FactoryBuilder().add('s', 'source').add('split', 'split').add('r', type).add('o', 'output')
    .wire('s', 'split').wire('split', 'r', 'trigger').wire('r', 'o').graph;
  const run = new Simulation(graph, [0, 0, 0]);
  expect(rng).not.toHaveBeenCalled();
  run.run(); expect(run.error).toBeUndefined(); expect(run.output).toHaveLength(3); expect(rng).toHaveBeenCalledTimes(3);
  run.step(); expect(rng).toHaveBeenCalledTimes(3);
  rng.mockClear();
  const empty = new Simulation(graph, []).run(); expect(empty.output).toEqual([]); expect(rng).not.toHaveBeenCalled();
  const definition = registry.get(type);
  expect(definition.execute({ input: 0, inputs: { trigger: [] }, connected: new Set(), config: definition.defaults, memory: {} }).outputs.out).toHaveLength(1);
});

test('Dice Rolls survives serialization and produces the same draws in Step and Run', () => {
  const rng = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const example = examples.find(e => e.id === 'dice-rolls')!;
  const graph = deserializeGraph(serializeGraph(example.graph));
  const step = new Simulation(graph, example.input);
  while (!step.done) step.step();
  expect(step.output).toEqual([[4, 4, 4, 4, 4]]);
  expect(rng).toHaveBeenCalledTimes(5);
  expect(new Simulation(graph, example.input).run().output).toEqual(step.output);
});

test('sequence nodes validate runtime data and preserve packet shape', () => {
  const graphFor = (type: string, config = {}) => new FactoryBuilder().add('s', 'source').add('r', type, config).add('o', 'output').wire('s', 'r').wire('r', 'o').graph;
  expect(new Simulation(graphFor('choice'), []).run().error).toContain('пустой');
  expect(new Simulation(graphFor('shuffle'), 'abc').run().error).toContain('array');
  expect(new Simulation(graphFor('sample', { k: 3 }), [1, 2]).run().error).toContain('длину');
  expect(new Simulation(graphFor('sample', { k: 0 }), []).run().output).toEqual([[]]);
  expect(new Simulation(graphFor('choice'), [[1, 2]]).run().output).toEqual([[1, 2]]);
});

import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { levels } from '../content/levels';
import { FactoryBuilder, solution } from '../core/test-factories';
import { PythonGenerator } from './generators';
import { createProgram } from './ir';
import type { DataValue, FactoryGraph } from '../core/types';
import { Simulation } from '../core/simulation';

// Python is optional for development; core and browser gameplay never need it.
const python = process.env.PYTHON || 'python';
const available = spawnSync(python, ['--version'], { encoding: 'utf8' }).status === 0;

test.skipIf(!available).each(['random', 'randint', 'randrange', 'uniform'])('Python random module executes %s with valid bounds', type => {
  const graph = new FactoryBuilder().add('s', 'source').add('r', type).add('o', 'output').wire('s', 'r', 'trigger').wire('r', 'o').graph;
  const values = execute(graph, Array.from({ length: 32 }, () => 0));
  expect(values).toHaveLength(32);
  for (const value of values) {
    expect(typeof value).toBe('number');
    const n = value as number;
    if (type === 'randint') { expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(6); }
    else if (type === 'randrange') { expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(10); }
    else { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1); if (type === 'random') expect(n).toBeLessThan(1); }
  }
});

test.skipIf(!available)('Python choice, shuffle and sample preserve sequence semantics', () => {
  const graphFor = (type: string, config = {}) => new FactoryBuilder().add('s', 'source').add('r', type, config).add('o', 'output').wire('s', 'r').wire('r', 'o').graph;
  const choices = execute(graphFor('choice'), ['🚀A', ['only']]);
  expect(['🚀', 'A']).toContain(choices[0]); expect(choices[1]).toBe('only');
  const shuffled = execute(graphFor('shuffle'), [[1, 1, 2], []]);
  expect((shuffled[0] as number[]).sort()).toEqual([1, 1, 2]); expect(shuffled[1]).toEqual([]);
  const samples = execute(graphFor('sample', { k: 2 }), ['🚀A', [1, 1], [1, 2, 3]]);
  expect((samples[0] as string[]).sort()).toEqual(['🚀', 'A'].sort()); expect(samples[1]).toEqual([1, 1]);
  expect(samples[2]).toHaveLength(2); expect(new Set(samples[2] as number[]).size).toBe(2);
  expect(execute(graphFor('sample', { k: 0 }), [[]])).toEqual([[]]);
});
function execute(graph: FactoryGraph, inputs: DataValue[]): DataValue[] {
  const code = new PythonGenerator().generate(createProgram(graph));
  const script = `${code}\nimport json\ninputs = json.loads(${JSON.stringify(JSON.stringify(inputs))})\nprint(json.dumps([factory(x) for x in inputs]))`;
  const result = spawnSync(python, ['-X', 'utf8', '-c', script], { encoding: 'utf8', timeout: 10000 });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as DataValue[];
}
const extraNodes: { type: string; inputs: DataValue[]; config?: Record<string, DataValue> }[] = [
  { type: 'negate', inputs: [-3, 0, 2.5] },
  { type: 'abs', inputs: [-3, 0, 2.5] },
  { type: 'not', inputs: [true, false] },
  { type: 'length', inputs: ['🚀АБ', '', [], [1, [2, 3]]] },
  { type: 'sum', inputs: [[], [2, -1, 0.5]] },
  { type: 'sort', inputs: [[], [10, 2, -1, 2]] },
  { type: 'sort', inputs: [[10, 2, -1]], config: { order: 'descending' } },
  { type: 'unique', inputs: [[], [1, true, [1], [1], '1', 1, true]] },
];
test.skipIf(!available).each(extraNodes)('Python matches runtime for $type ($config)', ({ type, inputs, config }) => {
  const graph = new FactoryBuilder().add('s', 'source').add('n', type, config).add('o', 'output').wire('s', 'n').wire('n', 'o').graph;
  expect(execute(graph, inputs)).toEqual(inputs.map(input => new Simulation(graph, input).run().output[0]));
});
test.skipIf(!available)('Python concat matches stream broadcasting and empty input', () => {
  const graph = new FactoryBuilder().add('s', 'source').add('split', 'split').add('suffix', 'constant', { value: '!' }).add('n', 'concat').add('o', 'output')
    .wire('s', 'split').wire('split', 'n', 'a').wire('suffix', 'n', 'b').wire('n', 'o').graph;
  expect(execute(graph, [['А', '🚀'], []])).toEqual([['А!', '🚀!'], []]);
});
levels.forEach((level, index) => test.skipIf(!available)(`generated Python executes every ${level.id} test`, () => {
  expect(execute(solution(index), level.tests.map(t => t.input))).toEqual(level.tests.map(t => t.expected));
}));
test.skipIf(!available)('Python equality keeps boolean distinct from number, including nested arrays', () => {
  const b = new FactoryBuilder().add('s', 'source').add('c', 'constant', { value: [true] }).add('cmp', 'comparator', { operation: '==' }).add('o', 'output').wire('s', 'cmp', 'a').wire('c', 'cmp', 'b').wire('cmp', 'o');
  expect(execute(b.graph, [[1], [true], ['true']])).toEqual([false, true, false]);
});
test.skipIf(!available)('Python preserves merged-stream delivery order when wires were created in reverse', () => {
  const b = new FactoryBuilder().add('s', 'source').add('split', 'split').add('cmp', 'comparator').add('ten', 'constant', { value: 10 }).add('branch', 'branch').add('o', 'output')
    .wire('s', 'split').wire('split', 'cmp', 'a').wire('ten', 'cmp', 'b').wire('split', 'branch', 'data').wire('cmp', 'branch', 'condition')
    .wire('branch', 'o', 'in', 'false').wire('branch', 'o', 'in', 'true');
  const input = [2, 30, 8, 50];
  const expected = new Simulation(b.graph, input).run().output;
  expect(expected).toEqual([30, 50, 2, 8]); expect(execute(b.graph, [input])).toEqual([expected]);
});

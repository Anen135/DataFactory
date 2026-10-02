/** Reference factories for tests only; never imported by the application. */
import { registry } from './machines';
import { emptyGraph, type DataValue, type FactoryGraph } from './types';
export class FactoryBuilder {
  graph = emptyGraph();
  add(id: string, type: string, config: Record<string, DataValue> = {}): this { this.graph.machines.push({ id, type, x: this.graph.machines.length * 220, y: 100, config: { ...registry.get(type).defaults, ...config } }); return this; }
  wire(from: string, to: string, input = 'in', output = 'out'): this { this.graph.connections.push({ id: `c${this.graph.connections.length}`, from: { machine: from, port: output }, to: { machine: to, port: input } }); return this; }
}
export function solution(index: number): FactoryGraph {
  const b = new FactoryBuilder().add('s', 'source').add('o', 'output');
  if (index === 0) return b.wire('s', 'o').graph;
  if (index <= 3) return b.add('c', 'constant', { value: index === 1 ? 2 : 10 }).add('m', index === 3 ? 'comparator' : 'arithmetic', { operation: index === 1 ? '*' : index === 2 ? '+' : '>' }).wire('s', 'm', 'a').wire('c', 'm', 'b').wire('m', 'o').graph;
  if (index === 4) return b.add('two', 'constant', { value: 2 }).add('zero', 'constant', { value: 0 }).add('mod', 'arithmetic', { operation: '%' }).add('eq', 'comparator', { operation: '==' }).wire('s', 'mod', 'a').wire('two', 'mod', 'b').wire('mod', 'eq', 'a').wire('zero', 'eq', 'b').wire('eq', 'o').graph;
  if ([5, 6, 9].includes(index)) {
    b.add('split', 'split').add('join', 'join').wire('s', 'split');
    if (index !== 5) b.add('stack', 'stack').wire('split', 'stack').wire('stack', 'join'); else b.wire('split', 'join');
    if (index === 9) b.add('eq', 'comparator', { operation: '==' }).wire('s', 'eq', 'a').wire('join', 'eq', 'b').wire('eq', 'o'); else b.wire('join', 'o');
    return b.graph;
  }
  if (index === 7) return b.add('zero', 'constant', { value: 0 }).add('cmp', 'comparator').add('branch', 'branch').add('yes', 'constant', { value: 'POSITIVE' }).add('no', 'constant', { value: 'NEGATIVE' }).wire('s', 'cmp', 'a').wire('zero', 'cmp', 'b').wire('s', 'branch', 'data').wire('cmp', 'branch', 'condition').wire('branch', 'yes', 'trigger', 'true').wire('branch', 'no', 'trigger', 'false').wire('yes', 'o').wire('no', 'o').graph;
  if (index === 8) return b.add('split', 'split').add('ten', 'constant', { value: 10 }).add('cmp', 'comparator').add('filter', 'filter').add('join', 'join', { mode: 'array' }).wire('s', 'split').wire('split', 'cmp', 'a').wire('ten', 'cmp', 'b').wire('split', 'filter', 'data').wire('cmp', 'filter', 'condition').wire('filter', 'join').wire('join', 'o').graph;
  if (index === 10) return b.add('abs', 'abs').wire('s', 'abs').wire('abs', 'o').graph;
  if (index === 11) return b.add('negate', 'negate').wire('s', 'negate').wire('negate', 'o').graph;
  if (index === 12) return b.add('ten', 'constant', { value: 10 }).add('cmp', 'comparator').add('not', 'not').wire('s', 'cmp', 'a').wire('ten', 'cmp', 'b').wire('cmp', 'not').wire('not', 'o').graph;
  if (index === 13) return b.add('len', 'length').wire('s', 'len').wire('len', 'o').graph;
  if (index === 14) return b.add('bang', 'constant', { value: '!' }).add('concat', 'concat').wire('s', 'concat', 'a').wire('bang', 'concat', 'b').wire('concat', 'o').graph;
  if (index === 15) return b.add('sum', 'sum').wire('s', 'sum').wire('sum', 'o').graph;
  if (index === 16) return b.add('sort', 'sort').wire('s', 'sort').wire('sort', 'o').graph;
  if (index === 17) return b.add('unique', 'unique').wire('s', 'unique').wire('unique', 'o').graph;
  if (index === 18) return b.add('sum', 'sum').add('len', 'length').add('div', 'arithmetic', { operation: '/' }).wire('s', 'sum').wire('s', 'len').wire('sum', 'div', 'a').wire('len', 'div', 'b').wire('div', 'o').graph;
  if (index === 19) return b.add('split', 'split').add('stack', 'stack').add('join', 'join', { mode: 'array' }).wire('s', 'split').wire('split', 'stack').wire('stack', 'join').wire('join', 'o').graph;
  return b.graph;
}

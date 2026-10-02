import type { DataValue, FactoryGraph } from '../core/types';

export const examples: { id: string; name: string; description: string; input: DataValue; graph: FactoryGraph }[] = [
  {
    id: 'signal', name: 'Signal Flow', description: 'Передача входного значения: Source → Output.', input: 42,
    graph: { version: 1, machines: [
      { id: 'source', type: 'source', x: 72, y: 96, config: {} },
      { id: 'output', type: 'output', x: 384, y: 96, config: {} },
    ], connections: [{ id: 'c1', from: { machine: 'source', port: 'out' }, to: { machine: 'output', port: 'in' } }] },
  },
  {
    id: 'multiply', name: 'Multiply Stream', description: 'Умножение входного числа на настраиваемую константу.', input: 21,
    graph: { version: 1, machines: [
      { id: 'source', type: 'source', x: 48, y: 48, config: {} },
      { id: 'constant', type: 'constant', x: 48, y: 240, config: { value: 2 } },
      { id: 'math', type: 'arithmetic', x: 336, y: 120, config: { operation: '*' } },
      { id: 'output', type: 'output', x: 624, y: 120, config: {} },
    ], connections: [
      { id: 'c1', from: { machine: 'source', port: 'out' }, to: { machine: 'math', port: 'a' } },
      { id: 'c2', from: { machine: 'constant', port: 'out' }, to: { machine: 'math', port: 'b' } },
      { id: 'c3', from: { machine: 'math', port: 'out' }, to: { machine: 'output', port: 'in' } },
    ] },
  },
  {
    id: 'filter-array', name: 'Filter Array',
    description: 'Оставляет числа больше 10: [2, 15, 5, 30, 10, 42] → [15, 30, 42]. Измените порог в Constant.',
    input: [2, 15, 5, 30, 10, 42],
    graph: { version: 1, machines: [
      { id: 'source', type: 'source', x: 48, y: 48, config: {} },
      { id: 'split', type: 'split', x: 312, y: 48, config: {} },
      { id: 'threshold', type: 'constant', x: 48, y: 288, config: { value: 10 } },
      { id: 'compare', type: 'comparator', x: 312, y: 288, config: { operation: '>' } },
      { id: 'filter', type: 'filter', x: 576, y: 120, config: {} },
      { id: 'join', type: 'join', x: 840, y: 120, config: { mode: 'array' } },
      { id: 'output', type: 'output', x: 840, y: 312, config: {} },
    ], connections: [
      { id: 'c1', from: { machine: 'source', port: 'out' }, to: { machine: 'split', port: 'in' } },
      { id: 'c2', from: { machine: 'split', port: 'out' }, to: { machine: 'compare', port: 'a' } },
      { id: 'c3', from: { machine: 'threshold', port: 'out' }, to: { machine: 'compare', port: 'b' } },
      { id: 'c4', from: { machine: 'split', port: 'out' }, to: { machine: 'filter', port: 'data' } },
      { id: 'c5', from: { machine: 'compare', port: 'out' }, to: { machine: 'filter', port: 'condition' } },
      { id: 'c6', from: { machine: 'filter', port: 'out' }, to: { machine: 'join', port: 'in' } },
      { id: 'c7', from: { machine: 'join', port: 'out' }, to: { machine: 'output', port: 'in' } },
    ] },
  },
  {
    id: 'array-summary', name: 'Array Summary',
    description: 'Убирает повторы, сортирует числа и считает сумму: [3, 1, 3, 10, -2] → 12. Промежуточные массивы видны в Inspector.',
    input: [3, 1, 3, 10, -2],
    graph: { version: 1, machines: [
      { id: 'source', type: 'source', x: 48, y: 48, config: {} },
      { id: 'unique', type: 'unique', x: 312, y: 48, config: {} },
      { id: 'sort', type: 'sort', x: 576, y: 48, config: { order: 'ascending' } },
      { id: 'sum', type: 'sum', x: 312, y: 288, config: {} },
      { id: 'output', type: 'output', x: 576, y: 288, config: {} },
    ], connections: [
      { id: 'c1', from: { machine: 'source', port: 'out' }, to: { machine: 'unique', port: 'in' } },
      { id: 'c2', from: { machine: 'unique', port: 'out' }, to: { machine: 'sort', port: 'in' } },
      { id: 'c3', from: { machine: 'sort', port: 'out' }, to: { machine: 'sum', port: 'in' } },
      { id: 'c4', from: { machine: 'sum', port: 'out' }, to: { machine: 'output', port: 'in' } },
    ] },
  },
  {
    id: 'dice-rolls', name: 'Dice Rolls',
    description: 'Пять бросков кубика: каждый элемент входного массива запускает RANDINT от 1 до 6. RUN бросает заново; Step показывает передачу результатов.',
    input: [0, 0, 0, 0, 0],
    graph: { version: 1, machines: [
      { id: 'source', type: 'source', x: 48, y: 48, config: {} },
      { id: 'split', type: 'split', x: 312, y: 48, config: {} },
      { id: 'dice', type: 'randint', x: 576, y: 48, config: { min: 1, max: 6 } },
      { id: 'join', type: 'join', x: 312, y: 288, config: { mode: 'array' } },
      { id: 'output', type: 'output', x: 576, y: 288, config: {} },
    ], connections: [
      { id: 'c1', from: { machine: 'source', port: 'out' }, to: { machine: 'split', port: 'in' } },
      { id: 'c2', from: { machine: 'split', port: 'out' }, to: { machine: 'dice', port: 'trigger' } },
      { id: 'c3', from: { machine: 'dice', port: 'out' }, to: { machine: 'join', port: 'in' } },
      { id: 'c4', from: { machine: 'join', port: 'out' }, to: { machine: 'output', port: 'in' } },
    ] },
  },
];

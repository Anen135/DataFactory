import type { DataValue, Machine, MachineDefinition, Port, PortType } from './types';
import { equal, isDataValue, number, pairs } from './values';
import { randomChoice, randomConfigurationError, randomInteger, randomRange, randomSample, randomShuffle, randomUniform } from './random';
const input = (id: string, types: PortType[] = ['any'], required = true, multiple = false): Port => ({ id, label: id.toUpperCase(), direction: 'input', types, required, multiple });
const output = (id = 'out', types: PortType[] = ['any']): Port => ({ id, label: id.toUpperCase(), direction: 'output', types });
const out = (values: DataValue[]) => ({ outputs: { out: values } });
function arrayValue(value: DataValue): DataValue[] {
  if (!Array.isArray(value)) throw new Error('Ожидается массив.');
  return value;
}
function stringValue(value: DataValue): string {
  if (typeof value !== 'string') throw new Error('Ожидается строка.');
  return value;
}

export const arithmetic: Record<string, (a: number, b: number) => number> = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => { if (b === 0) throw new Error('Деление на ноль.'); return a / b; }, '%': (a, b) => { if (b === 0) throw new Error('Остаток от деления на ноль.'); return a % b; }, };
export const comparisons: Record<string, (a: DataValue, b: DataValue) => boolean> = { '==': equal, '!=': (a, b) => !equal(a, b), '>': (a, b) => number(a) > number(b), '<': (a, b) => number(a) < number(b), '>=': (a, b) => number(a) >= number(b), '<=': (a, b) => number(a) <= number(b), };

const definitions: MachineDefinition[] = [
  { type: 'source',     name: 'SOURCE',   description: 'Вход программы. Отправляет заданное значение.',
    icon: '↗', color: 0x65dfb0, defaults: {}, fields: [],
    ports: [output()],
    execute: c => out([c.input]) },
  { type: 'output',     name: 'OUTPUT',   description: 'Финальный результат. Принимает активную ветку.',
    icon: '◎', color: 0xf4ba69, defaults: {}, fields: [],
    ports: [ input('in', ['any'], true, true)],
    execute: c => ({ outputs: {}, state: { result: c.inputs.in } }) },
  { type: 'constant',   name: 'CONSTANT', description: 'Постоянное значение. Необязательный trigger выпускает значение для каждого пакета.',
    icon: '#', color: 0xb7a1ed, defaults: { value: 2 }, fields: [{ key: 'value', label: 'Значение (JSON)', kind: 'value' }],
    ports: [input('trigger', ['any'], false), output()],
    execute: c => out(c.connected.has('trigger') ? c.inputs.trigger.map(() => c.config.value) : [c.config.value]) },
  { type: 'arithmetic', name: 'MATH',     description: 'Арифметика A и B. Одна константа применяется ко всему потоку.',
    icon: '±', color: 0x79b5f1,
    ports: [input('a', ['number']), input('b', ['number']), output('out', ['number'])], defaults: { operation: '*' }, fields: [{ key: 'operation', label: 'Операция', kind: 'select', options: Object.keys(arithmetic) }], execute: c => { const fn = arithmetic[String(c.config.operation)]; if (!fn) throw new Error('Неизвестная арифметическая операция.'); return out(pairs(c.inputs.a, c.inputs.b).map(([a, b]) => fn(number(a), number(b)))); } },
  { type: 'comparator', name: 'COMPARE',  description: 'Сравнение A и B. Возвращает boolean.',
    icon: '≷', color: 0x79b5f1,
    ports: [input('a'), input('b'), output('out', ['boolean'])], defaults: { operation: '>' }, fields: [{ key: 'operation', label: 'Условие', kind: 'select', options: Object.keys(comparisons) }], execute: c => { const fn = comparisons[String(c.config.operation)]; if (!fn) throw new Error('Неизвестное условие.'); return out(pairs(c.inputs.a, c.inputs.b).map(([a, b]) => fn(a, b))); } },
  { type: 'split',      name: 'SPLIT',    description: 'Разделяет строку или массив на поток элементов.',
    icon: '⋮', color: 0x64cbd6,
    ports: [input('in', ['string', 'array']), output()], defaults: {}, fields: [], execute: c => out(c.inputs.in.flatMap(v => { if (typeof v === 'string') return Array.from(v); if (Array.isArray(v)) return v; throw new Error('SPLIT принимает строку или массив.'); })) },
  { type: 'join',       name: 'JOIN',     description: 'Ждёт завершения потока и собирает строку или массив.',
    icon: '⋯', color: 0x64cbd6,
    ports: [input('in'), output()], defaults: { mode: 'string' }, fields: [{ key: 'mode', label: 'Собрать в', kind: 'select', options: ['string', 'array'] }], execute: c => { if (c.config.mode === 'array') return out([[...c.inputs.in]]); if (c.inputs.in.some(v => typeof v !== 'string')) throw new Error('JOIN в режиме string принимает только символы и строки. Для чисел выберите array.'); return out([c.inputs.in.join('')]); } },
  { type: 'stack',      name: 'STACK',    description: 'LIFO: последний вошёл — первый вышел. Разворачивает поток.',
    icon: '▤', color: 0xe3a1cf,
    ports: [input('in'), output()], defaults: {}, fields: [], execute: c => ({ ...out([...c.inputs.in].reverse()), state: { buffered: [...c.inputs.in], order: 'LIFO' } }) },
  { type: 'queue',      name: 'QUEUE',    description: 'FIFO: первый вошёл — первый вышел. Сохраняет порядок.',
    icon: '≡', color: 0xe3a1cf,
    ports: [input('in'), output()], defaults: {}, fields: [], execute: c => ({ ...out([...c.inputs.in]), state: { buffered: [...c.inputs.in], order: 'FIFO' } }) },
  { type: 'branch',     name: 'BRANCH',   description: 'Направляет data в true или false по condition.',
    icon: '⑂', color: 0xf0c575,
    ports: [input('data'), input('condition', ['boolean']), output('true'), output('false')], defaults: {}, fields: [], execute: c => { const yes: DataValue[] = [], no: DataValue[] = []; for (const [v, test] of pairs(c.inputs.data, c.inputs.condition)) { if (typeof test !== 'boolean') throw new Error('Условие BRANCH должно быть boolean.'); (test ? yes : no).push(v); } return { outputs: { true: yes, false: no } }; } },
  { type: 'filter',     name: 'FILTER',   description: 'Пропускает элементы data с условием true.',
    icon: '▽', color: 0xf0c575,
    ports: [input('data'), input('condition', ['boolean']), output()], defaults: {}, fields: [], execute: c => out(pairs(c.inputs.data, c.inputs.condition).filter(([, b]) => { if (typeof b !== 'boolean') throw new Error('Условие FILTER должно быть boolean.'); return b; }).map(([v]) => v)) },
  { type: 'memory',     name: 'MEMORY',   description: 'Переменная: write обновляет значение, read выдаёт текущее после записи. Сбрасывается при новом запуске.',
    icon: '▣', color: 0xb7a1ed,
    ports: [input('write', ['any'], false), input('read', ['any'], false), output()], defaults: { initial: 0 }, fields: [{ key: 'initial', label: 'Начальное значение (JSON)', kind: 'value' }], execute: c => { const previous = c.memory.value ?? c.config.initial; let current = previous; const writes = c.inputs.write ?? []; const values = writes.map(v => { current = v; return v; }); c.memory.value = current; return { outputs: { out: c.connected.has('read') ? (c.inputs.read ?? []).map(() => current) : values.length ? values : [current] }, state: { previous, incoming: writes, current } }; } },
  { type: 'negate', name: 'NEGATE', description: 'Меняет знак каждого числа в потоке.',
    icon: '−', color: 0x79b5f1, ports: [input('in', ['number']), output('out', ['number'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => -number(v))) },
  { type: 'abs', name: 'ABS', description: 'Возвращает модуль каждого числа: −5 → 5.',
    icon: '|x|', color: 0x79b5f1, ports: [input('in', ['number']), output('out', ['number'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => Math.abs(number(v)))) },
  { type: 'not', name: 'NOT', description: 'Логическое отрицание: true → false, false → true.',
    icon: '¬', color: 0xf0c575, ports: [input('in', ['boolean']), output('out', ['boolean'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => { if (typeof v !== 'boolean') throw new Error('NOT ожидает boolean.'); return !v; })) },
  { type: 'length', name: 'LENGTH', description: 'Количество элементов массива или Unicode-символов строки. Каждый пакет обрабатывается отдельно.',
    icon: '#', color: 0x64cbd6, ports: [input('in', ['string', 'array']), output('out', ['number'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => typeof v === 'string' ? Array.from(v).length : arrayValue(v).length)) },
  { type: 'concat', name: 'CONCAT', description: 'Соединяет строки A и B. Одна строка применяется ко всему второму потоку.',
    icon: 'ab', color: 0x64cbd6, ports: [input('a', ['string']), input('b', ['string']), output('out', ['string'])], defaults: {}, fields: [],
    execute: c => out(pairs(c.inputs.a, c.inputs.b).map(([a, b]) => stringValue(a) + stringValue(b))) },
  { type: 'sum', name: 'SUM', description: 'Сумма чисел в каждом входном массиве. Пустой массив даёт 0. Для суммы потока сначала используйте Join (array).',
    icon: 'Σ', color: 0x79b5f1, ports: [input('in', ['array']), output('out', ['number'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => arrayValue(v).reduce<number>((sum, item) => sum + number(item), 0))) },
  { type: 'sort', name: 'SORT', description: 'Сортирует числа внутри каждого массива. Порядок задаётся в Inspector; исходный массив сохраняется.',
    icon: '↕', color: 0x64cbd6, ports: [input('in', ['array']), output('out', ['array'])], defaults: { order: 'ascending' },
    fields: [{ key: 'order', label: 'Порядок', kind: 'select', options: ['ascending', 'descending'] }],
    execute: c => out(c.inputs.in.map(v => arrayValue(v).map(number).sort((a, b) => c.config.order === 'descending' ? b - a : a - b))) },
  { type: 'unique', name: 'UNIQUE', description: 'Удаляет повторы внутри каждого массива, сохраняя порядок. Сравнивает значения и вложенные массивы по содержимому.',
    icon: '≠', color: 0x64cbd6, ports: [input('in', ['array']), output('out', ['array'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(v => { const values = arrayValue(v); return values.filter((item, index) => values.findIndex(other => equal(item, other)) === index); })) },
  { type: 'random', name: 'RANDOM', description: 'random(): число от 0 включительно до 1 исключительно. Один результат на Trigger; без подключения — один результат за запуск.',
    icon: '⚄', color: 0xe3a1cf, ports: [input('trigger', ['any'], false), output('out', ['number'])], defaults: {}, fields: [],
    execute: c => out((c.connected.has('trigger') ? c.inputs.trigger : [0]).map(() => Math.random())) },
  { type: 'randint', name: 'RANDINT', description: 'randint(min, max): случайное целое, включая обе границы. Один результат на Trigger; без подключения — один за запуск.',
    icon: '⚄', color: 0xe3a1cf, ports: [input('trigger', ['any'], false), output('out', ['number'])], defaults: { min: 1, max: 6 },
    fields: [{ key: 'min', label: 'Минимум (целое)', kind: 'value' }, { key: 'max', label: 'Максимум (целое)', kind: 'value' }],
    execute: c => out((c.connected.has('trigger') ? c.inputs.trigger : [0]).map(() => randomInteger(c.config.min, c.config.max))) },
  { type: 'randrange', name: 'RANDRANGE', description: 'randrange(start, stop, step): случайный элемент целочисленного диапазона. Stop не включается. Один результат на Trigger.',
    icon: '⚄', color: 0xe3a1cf, ports: [input('trigger', ['any'], false), output('out', ['number'])], defaults: { start: 0, stop: 10, step: 1 },
    fields: [{ key: 'start', label: 'Start (целое)', kind: 'value' }, { key: 'stop', label: 'Stop, не включается (целое)', kind: 'value' }, { key: 'step', label: 'Шаг (ненулевое целое)', kind: 'value' }],
    execute: c => out((c.connected.has('trigger') ? c.inputs.trigger : [0]).map(() => randomRange(c.config.start, c.config.stop, c.config.step))) },
  { type: 'uniform', name: 'UNIFORM', description: 'uniform(a, b): случайное дробное число между границами. Границы можно задать в обратном порядке. Один результат на Trigger.',
    icon: '⚄', color: 0xe3a1cf, ports: [input('trigger', ['any'], false), output('out', ['number'])], defaults: { a: 0, b: 1 },
    fields: [{ key: 'a', label: 'Граница A (число)', kind: 'value' }, { key: 'b', label: 'Граница B (число)', kind: 'value' }],
    execute: c => out((c.connected.has('trigger') ? c.inputs.trigger : [0]).map(() => randomUniform(c.config.a, c.config.b))) },
  { type: 'choice', name: 'CHOICE', description: 'choice(seq): выбирает один элемент каждого непустого массива или один Unicode-символ строки.',
    icon: '?', color: 0xe3a1cf, ports: [input('in', ['array', 'string']), output()], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(randomChoice)) },
  { type: 'shuffle', name: 'SHUFFLE', description: 'shuffle: перемешивает каждый входной массив и выдаёт его копию. Исходный массив не изменяется.',
    icon: '⇄', color: 0xe3a1cf, ports: [input('in', ['array']), output('out', ['array'])], defaults: {}, fields: [],
    execute: c => out(c.inputs.in.map(randomShuffle)) },
  { type: 'sample', name: 'SAMPLE', description: 'sample(seq, k): выбирает k элементов без повторного выбора одной позиции. Выход — массив. Одинаковые значения в исходных позициях могут повториться.',
    icon: '⚄', color: 0xe3a1cf, ports: [input('in', ['array', 'string']), output('out', ['array'])], defaults: { k: 1 },
    fields: [{ key: 'k', label: 'Количество K (целое ≥ 0)', kind: 'value' }],
    execute: c => out(c.inputs.in.map(v => randomSample(v, c.config.k))) },
];
export class MachineRegistry {
  private definitions = new Map<string, MachineDefinition>();
  constructor(initial: MachineDefinition[] = definitions) { initial.forEach(d => this.register(d)); }
  register(definition: MachineDefinition): void { if (this.definitions.has(definition.type)) throw new Error(`Машина ${definition.type} уже существует.`); this.definitions.set(definition.type, definition); }
  get(type: string): MachineDefinition { const value = this.definitions.get(type); if (!value) throw new Error(`Неизвестная машина: ${type}`); return value; }
  all(): MachineDefinition[] { return [...this.definitions.values()]; }
}
export const registry = new MachineRegistry();

/** Validate configuration at every boundary: editor, import and execution. */
export function configurationError(machine: Machine, definitions = registry): string | undefined {
  const definition = definitions.get(machine.type);
  for (const key of Object.keys(definition.defaults)) {
    if (!Object.hasOwn(machine.config, key) || !isDataValue(machine.config[key])) return `${definition.name}: некорректный параметр ${key}.`;
  }
  for (const field of definition.fields) {
    if (field.kind === 'select' && !field.options?.includes(String(machine.config[field.key]))) return `${definition.name}: выберите допустимое значение «${field.label}».`;
  }
  return randomConfigurationError(machine.type, machine.config);
}

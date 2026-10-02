import type { DataValue } from './types';

function integer(value: DataValue): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Random: требуется безопасное целое число.');
  return value;
}
function finite(value: DataValue): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Random: требуется конечное число.');
  return value;
}
function integerCount(min: DataValue, max: DataValue): number {
  const count = integer(max) - integer(min) + 1;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('RANDINT: min должен быть ≤ max; диапазон должен помещаться в безопасное целое число.');
  return count;
}
function rangeCount(start: DataValue, stop: DataValue, step: DataValue): number {
  const a = integer(start), b = integer(stop), stride = integer(step);
  if (stride === 0) throw new Error('RANDRANGE: step не может быть 0.');
  const count = Math.ceil((b - a) / stride);
  if (!Number.isSafeInteger(b - a) || !Number.isSafeInteger(count) || count < 1) throw new Error('RANDRANGE: пустой или слишком большой диапазон. Проверьте start, stop и step.');
  return count;
}
function uniformBounds(a: DataValue, b: DataValue): void {
  if (!Number.isFinite(finite(b) - finite(a))) throw new Error('UNIFORM: слишком большой диапазон.');
}
function sampleCount(k: DataValue): number {
  const count = integer(k);
  if (count < 0) throw new Error('SAMPLE: k должно быть ≥ 0.');
  return count;
}
function sequence(value: DataValue): DataValue[] {
  if (typeof value === 'string') return Array.from(value);
  if (Array.isArray(value)) return value;
  throw new Error('Random: требуется строка или массив.');
}

/** Validate settings without consuming randomness during editing or graph validation. */
export function randomConfigurationError(type: string, config: Record<string, DataValue>): string | undefined {
  try {
    if (type === 'randint') integerCount(config.min, config.max);
    else if (type === 'randrange') rangeCount(config.start, config.stop, config.step);
    else if (type === 'uniform') uniformBounds(config.a, config.b);
    else if (type === 'sample') sampleCount(config.k);
  } catch (error) { return (error as Error).message; }
  return undefined;
}
export function randomInteger(min: DataValue, max: DataValue): number {
  return integer(min) + Math.floor(Math.random() * integerCount(min, max));
}
export function randomRange(start: DataValue, stop: DataValue, step: DataValue): number {
  return integer(start) + Math.floor(Math.random() * rangeCount(start, stop, step)) * integer(step);
}
export function randomUniform(a: DataValue, b: DataValue): number {
  uniformBounds(a, b);
  return finite(a) + (finite(b) - finite(a)) * Math.random();
}
export function randomChoice(value: DataValue): DataValue {
  const values = sequence(value);
  if (!values.length) throw new Error('CHOICE: нельзя выбрать элемент из пустой последовательности.');
  return values[Math.floor(Math.random() * values.length)];
}
export function randomShuffle(value: DataValue): DataValue[] {
  if (!Array.isArray(value)) throw new Error('SHUFFLE: требуется массив.');
  const result = [...value];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function randomSample(value: DataValue, k: DataValue): DataValue[] {
  const values = [...sequence(value)], count = sampleCount(k);
  if (count > values.length) throw new Error('SAMPLE: k превышает длину последовательности.');
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (values.length - i));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.slice(0, count);
}

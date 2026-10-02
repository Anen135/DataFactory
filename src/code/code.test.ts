import { expect, test } from 'vitest';
import { levels } from '../content/levels';
import { solution } from '../core/test-factories';
import { createProgram } from './ir';
import { JavaScriptGenerator, PythonGenerator } from './generators';
test('IR is independent, structured and ordered', () => { const g = solution(1); const p = createProgram(g); expect(p.nodes[0].operation).toBe('source'); p.nodes[0].parameters.x = 20; expect(g.machines[0].config.x).toBeUndefined(); });
test('scalar JavaScript executes actual generated code', () => { const code = new JavaScriptGenerator().generate(createProgram(solution(1))); const factory = new Function(`${code}; return factory;`)() as (n: number) => number; expect(factory(-3)).toBe(-6); });
test('Python for every level and signed remainder', () => { for (let i = 0; i < levels.length; i++) expect(new PythonGenerator().generate(createProgram(solution(i)))).toContain('def factory(input_value):'); expect(new PythonGenerator().generate(createProgram(solution(4)))).toContain('remainder('); });

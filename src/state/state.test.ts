import { expect, test } from 'vitest';
import { GameState } from './game-state';
import { Persistence, type StorageAdapter } from './storage';
import { solution } from '../core/test-factories';
const make = () => { const data = new Map<string, string>(); const storage: StorageAdapter = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }; return { state: new GameState(new Persistence(storage)), storage }; };
test('undo/redo create move configure connect delete', () => { const { state: s } = make(); s.addMachine('source', 12, 13); s.addMachine('output', 200, 10); s.connect({ machine: 'm1', port: 'out' }, { machine: 'm2', port: 'in' }); s.moveMachine('m1', 100, 100); expect(s.graph.machines[0].x).toBe(96); s.undo(); expect(s.graph.machines[0].x).toBe(24); s.redo(); s.select('m1'); s.removeSelected(); expect(s.graph.connections).toHaveLength(0); s.undo(); expect(s.graph.connections).toHaveLength(1); });
test('autosave restores graph and level', () => { const { state: s, storage } = make(); s.loadLevel('double'); s.addMachine('constant', 0, 0); s.configure('m1', 'value', 15); const restored = new GameState(new Persistence(storage)); expect(restored.level.id).toBe('double'); expect(restored.graph.machines[0].config.value).toBe(15); });
test('tutorial run locks edits, step deterministic and progress persists', () => { const { state: s, storage } = make(); s.loadLevel('first-signal'); s.import(JSON.stringify(solution(0))); s.step(); expect(s.simulation?.ticks).toBe(1); s.addMachine('source', 0, 0); expect(s.graph.machines).toHaveLength(2); while (!s.simulation?.done) s.step(); expect(s.result?.passed).toBe(true); expect(new Persistence(storage).progress()['first-signal'].completed).toBe(true); });
test('pause holds ticks and instant finishes without tutorial tests', () => { const { state: s } = make(); s.import(JSON.stringify(solution(0))); s.run(); s.run(); s.advance(200); expect(s.simulation?.ticks).toBe(0); s.run(); s.speed = 0; s.advance(16); expect(s.simulation?.output).toEqual([42]); expect(s.result).toBeUndefined(); expect(s.persistence.progress()).toEqual({}); });
test('invalid/corrupt storage does not crash', () => { const p = new Persistence({ getItem: () => '{bad', setItem: () => { throw Error('quota'); } }); expect(p.progress()).toEqual({}); expect(p.loadGraph('x')).toBeUndefined(); p.saveGraph('x', solution(0)); expect(p.warning).toContain('сохранить'); });

test('blank projects expose all nodes and restore graph and input', () => {
  const { state: s, storage } = make();
  expect(s.workspace).toBe('project'); expect(s.graph.machines).toEqual([]);
  s.addMachine('memory', 0, 0); expect(s.graph.machines[0].type).toBe('memory');
  s.setInput(['DATA', 7]);
  const restored = new GameState(new Persistence(storage));
  expect(restored.workspace).toBe('project'); expect(restored.input).toEqual(['DATA', 7]); expect(restored.graph).toEqual(s.graph);
});

test('projects and tutorial graphs stay independent across switches', () => {
  const { state: s } = make();
  const first = s.project.id;
  s.import(JSON.stringify(solution(0))); s.setInput(99);
  s.loadLevel('double'); s.addMachine('constant', 0, 0);
  s.newProject('Another factory'); expect(s.graph.machines).toHaveLength(0); expect(s.canUndo).toBe(false);
  s.openProject(first); expect(s.graph.machines).toHaveLength(2); expect(s.input).toBe(99);
  s.loadLevel('double'); expect(s.graph.machines).toHaveLength(1); expect(s.graph.machines[0].type).toBe('constant');
});

test('project files round trip and invalid files preserve the active project', () => {
  const { state: s } = make();
  s.newProject('Portable', solution(1), 17);
  const text = s.exportProject(), id = s.project.id;
  s.openFile(text, 'portable.df'); expect(s.project.id).not.toBe(id); expect(s.project.name).toBe('Portable'); expect(s.input).toBe(17); expect(s.graph).toEqual(solution(1));
  const current = s.project.id;
  s.openFile('{"format":"data-factory","version":99}', 'broken.df'); expect(s.project.id).toBe(current); expect(s.graph).toEqual(solution(1));
  s.openFile(JSON.stringify(solution(0)), 'legacy.json'); expect(s.project.name).toBe('legacy'); expect(s.graph).toEqual(solution(0));
});

test('runtime events and errors reset when a project changes', () => {
  const { state: s } = make();
  s.run(); expect(s.executionError).toBeTruthy();
  s.newProject('Working', solution(0), 'hello'); expect(s.executionError).toBeUndefined();
  s.step(); expect(s.events).toHaveLength(1);
  s.newProject(); expect(s.events).toEqual([]); expect(s.simulation).toBeUndefined();
});

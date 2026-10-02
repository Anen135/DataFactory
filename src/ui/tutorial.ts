import type { GameState } from '../state/game-state';
export function tutorialState(state: GameState): { current: number; text: string; count: number } | undefined {
  const steps = state.workspace === 'tutorial' ? state.level.tutorial : undefined; if (!steps) return;
  const current = steps.findIndex(step => {
    const conditions = { machine: () => state.graph.machines.some(m => m.type === step.machineType), connection: () => state.graph.connections.length > 0, completed: () => !!state.result?.passed };
    return !conditions[step.condition]();
  });
  return { current: current === -1 ? steps.length : current, text: current === -1 ? 'Отлично! Первый алгоритм работает. Переходите к следующему уровню.' : steps[current].text, count: steps.length };
}

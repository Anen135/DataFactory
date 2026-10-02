import { deserializeGraph, serializeGraph } from '../core/graph';
import type { DataValue, FactoryGraph, LevelResult } from '../core/types';
import { isDataValue } from '../core/values';
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface ProgressEntry { completed: boolean; machines: number; operations: number; ticks: number }
export interface SavedProject { id: string; name: string; updatedAt: number; input: DataValue }
export class Persistence {
  warning?: string;
  constructor(private storage: StorageAdapter) {}
  private read(key: string): string | null { try { return this.storage.getItem(`data-factory:v1:${key}`); } catch { this.warning = 'Хранилище недоступно. Экспортируйте фабрику в файл.'; return null; } }
  private write(key: string, value: string): void { try { this.storage.setItem(`data-factory:v1:${key}`, value); } catch { this.warning = 'Не удалось сохранить данные. Экспортируйте фабрику в файл.'; } }
  loadGraph(id: string): FactoryGraph | undefined { const raw = this.read(`graph:${id}`); if (!raw) return; try { return deserializeGraph(raw); } catch { this.warning = 'Сохранение повреждено. Открыта пустая фабрика.'; return; } }
  saveGraph(id: string, graph: FactoryGraph): void { this.write(`graph:${id}`, serializeGraph(graph)); }
  get activeWorkspace(): string | null { return this.read('active-workspace'); }
  set activeWorkspace(value: string) { this.write('active-workspace', value); }
  projects(): SavedProject[] {
    try {
      const value: unknown = JSON.parse(this.read('projects') ?? '[]');
      return Array.isArray(value) ? value.filter((p): p is SavedProject => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) && isDataValue(p.input)) : [];
    } catch { return []; }
  }
  saveProject(project: SavedProject, graph: FactoryGraph): void {
    this.saveGraph(`project:${project.id}`, graph);
    this.write('projects', JSON.stringify([project, ...this.projects().filter(p => p.id !== project.id)]));
  }
  get currentLevel(): string | null { return this.read('current-level'); }
  set currentLevel(id: string) { this.write('current-level', id); }
  progress(): Record<string, ProgressEntry> {
    try {
      const raw: unknown = JSON.parse(this.read('progress') ?? '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw).filter(([, v]: [string, unknown]) => {
        if (!v || typeof v !== 'object') return false; const p = v as Record<string, unknown>;
        return p.completed === true && ['machines', 'operations', 'ticks'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0);
      })) as Record<string, ProgressEntry>;
    } catch { return {}; }
  }
  record(id: string, result: LevelResult): void {
    if (!result.passed) return;
    const progress = this.progress(), previous = progress[id];
    progress[id] = { completed: true, machines: Math.min(previous?.machines ?? Infinity, result.machines), operations: Math.min(previous?.operations ?? Infinity, result.operations), ticks: Math.min(previous?.ticks ?? Infinity, result.ticks) };
    this.write('progress', JSON.stringify(progress));
  }
}

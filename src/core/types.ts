/** Deliberately independent of browser and renderer APIs. */
export type DataValue = number | string | boolean | DataValue[];
export type DataType = 'number' | 'string' | 'character' | 'boolean' | 'array';
export type PortType = DataType | 'any';
export interface Port { id: string; label: string; direction: 'input' | 'output'; types: readonly PortType[]; required?: boolean; multiple?: boolean }
export interface Machine { id: string; type: string; x: number; y: number; config: Record<string, DataValue> }
export interface Connection { id: string; from: { machine: string; port: string }; to: { machine: string; port: string } }
export interface FactoryGraph { version: 1; machines: Machine[]; connections: Connection[] }
/** Portable project document. Runtime snapshots and tutorial progress are not part of the program. */
export interface FactoryProject { format: 'data-factory'; version: 1; name: string; input: DataValue; graph: FactoryGraph }
export interface DataPacket { id: string; value: DataValue; type: DataType; currentConnection: string; state: 'created' | 'moving' | 'delivered' }
export interface ExecutionContext { input: DataValue; inputs: Record<string, DataValue[]>; connected: ReadonlySet<string>; config: Machine['config']; memory: Record<string, DataValue> }
export interface MachineResult { outputs: Record<string, DataValue[]>; state?: Record<string, DataValue> }
export interface ConfigField { key: string; label: string; kind: 'value' | 'select'; options?: string[] }
export interface MachineDefinition {
  type: string; name: string; description: string; icon: string; color: number;
  ports: Port[]; defaults: Machine['config']; fields: ConfigField[];
  execute(context: ExecutionContext): MachineResult;
}
export interface MachineSnapshot { inputs: Record<string, DataValue[]>; outputs: Record<string, DataValue[]>; state: Record<string, DataValue>; status: 'waiting' | 'processing' | 'done' }
export interface SimulationEvent { kind: 'process' | 'emit' | 'transfer' | 'close' | 'done' | 'error'; tick: number; machineId?: string; packet?: DataPacket; message?: string }
export interface LevelTest { input: DataValue; expected: DataValue; hidden?: boolean }
export interface TutorialStep { text: string; condition: 'machine' | 'connection' | 'completed'; machineType?: string }
export interface Level { id: string; name: string; topic: string; description: string; hint: string; inputType: DataType; availableMachines: string[]; tests: LevelTest[]; tutorial?: TutorialStep[]; medals: { machines: number; operations: number; ticks: number } }
export interface TestResult { index: number; hidden: boolean; passed: boolean; actual: DataValue[]; expected: DataValue; error?: string; operations: number; ticks: number }
export interface LevelResult { passed: boolean; tests: TestResult[]; machines: number; connections: number; operations: number; ticks: number }
export const emptyGraph = (): FactoryGraph => ({ version: 1, machines: [], connections: [] });
export const grid = { size: 24, snap: (n: number) => Math.round(n / 24) * 24 };

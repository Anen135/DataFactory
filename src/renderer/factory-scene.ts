import Phaser from 'phaser';
import { registry } from '../core/machines';
import type { Connection, Machine, SimulationEvent } from '../core/types';
import { formatValue } from '../core/values';
import type { GameState, StateChange } from '../state/game-state';
interface NodeView { container: Phaser.GameObjects.Container; border: Phaser.GameObjects.Rectangle }
interface MovingPacket { id: string; object: Phaser.GameObjects.Container; curve: Phaser.Curves.CubicBezier; progress: number; duration: number; force: boolean; moving: boolean }
export class FactoryScene extends Phaser.Scene {
  private gridGraphic!: Phaser.GameObjects.Graphics;
  private wires!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private nodes = new Map<string, NodeView>();
  private packets: MovingPacket[] = [];
  private pending?: Connection['from'];
  private panning = false;
  private space = false;
  private unsubscribe?: () => void;
  private host: HTMLElement;
  private resizeObserver?: ResizeObserver;
  constructor(readonly state: GameState, host: HTMLElement) { super('factory'); this.host = host; }
  create(): void {
    this.cameras.main.setBackgroundColor('#10191f');
    this.gridGraphic = this.add.graphics().setDepth(-20);
    this.wires = this.add.graphics().setDepth(-10);
    this.preview = this.add.graphics().setDepth(20);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (p.rightButtonDown() || p.middleButtonDown() || this.space) { this.panning = true; return; }
      if (!objects.length) {
        if (this.pending) { this.pending = undefined; this.preview.clear(); }
        const point = this.world(p.x, p.y); let chosen: string | undefined;
        for (const c of this.state.graph.connections) { const curve = this.curve(c); if (curve?.getPoints(35).some(v => Phaser.Math.Distance.Between(v.x, v.y, point.x, point.y) < 10 / this.cameras.main.zoom)) chosen = c.id; }
        this.state.select(undefined, chosen);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.panning && p.isDown) { this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom; this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom; this.drawGrid(); }
      if (this.pending) { const start = this.portPosition(this.pending.machine, this.pending.port, 'output'); const end = this.world(p.x, p.y); this.preview.clear(); if (start) { this.preview.lineStyle(2, 0x65dfb0, .8); new Phaser.Curves.CubicBezier(start, new Phaser.Math.Vector2(start.x + 80, start.y), new Phaser.Math.Vector2(end.x - 80, end.y), end).draw(this.preview, 35); } }
    });
    this.input.on('pointerupoutside', () => { this.panning = false; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.panning = false;
      if (this.pending) { const at = this.world(p.x, p.y); for (const m of this.state.graph.machines) for (const port of registry.get(m.type).ports.filter(p => p.direction === 'input')) { const position = this.portPosition(m.id, port.id, 'input')!; if (Phaser.Math.Distance.Between(at.x, at.y, position.x, position.y) < 15) { this.completeConnection(m.id, port.id); return; } } }
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? .9 : 1.1, p.x, p.y));
    this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => { if (!this.editingText()) { this.space = true; event.preventDefault(); } });
    this.input.keyboard?.on('keyup-SPACE', () => { this.space = false; this.panning = false; });
    this.input.on('drag', (p: Phaser.Input.Pointer, object: Phaser.GameObjects.Container, x: number, y: number) => { if (this.state.mode !== 'EDIT' || this.space || !p.leftButtonDown()) return; object.setPosition(x, y); this.drawWires(); });
    this.input.on('dragend', (_p: Phaser.Input.Pointer, object: Phaser.GameObjects.Container) => { if (this.state.mode === 'EDIT') this.state.moveMachine(object.name, object.x, object.y); });
    this.unsubscribe = this.state.subscribe(change => this.onChange(change));
    this.resizeObserver = new ResizeObserver(() => { if (this.host.clientWidth && this.host.clientHeight) { this.scale.resize(this.host.clientWidth, this.host.clientHeight); this.drawGrid(); } });
    this.resizeObserver.observe(this.host);
    this.events.once('shutdown', () => { this.unsubscribe?.(); this.resizeObserver?.disconnect(); });
    this.rebuild(); this.fit();
  }
  private editingText(): boolean { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? ''); }
  private onChange(change: StateChange): void {
    if (change.kind === 'graph' || change.kind === 'workspace') { this.pending = undefined; this.preview.clear(); this.clearPackets(); this.rebuild(); if (change.kind === 'workspace') this.fit(); }
    if (change.kind === 'selection') { this.decorate(); this.drawWires(); }
    if (change.kind === 'runtime') {
      if (this.state.mode === 'EDIT' || (!change.event && !this.state.simulation?.ticks)) this.clearPackets();
      if (change.event) this.animateEvent(change.event);
    }
  }
  private rebuild(): void {
    this.nodes.forEach(n => n.container.destroy()); this.nodes.clear();
    for (const machine of this.state.graph.machines) this.createNode(machine);
    this.drawWires(); this.decorate();
  }
  private createNode(machine: Machine): void {
    const d = registry.get(machine.type), container = this.add.container(machine.x, machine.y).setName(machine.id).setSize(180, 116);
    const shadow = this.add.rectangle(4, 5, 180, 116, 0x060c10, .6).setOrigin(0);
    const border = this.add.rectangle(0, 0, 180, 116, 0x1b2830).setOrigin(0).setStrokeStyle(1, 0x3b4c57);
    const stripe = this.add.rectangle(0, 0, 3, 116, d.color).setOrigin(0);
    const icon = this.add.text(14, 14, d.icon, { fontFamily: 'monospace', fontSize: '23px', color: Phaser.Display.Color.IntegerToColor(d.color).rgba });
    const title = this.add.text(43, 15, d.name, { fontFamily: 'Consolas, monospace', fontSize: '13px', fontStyle: 'bold', color: '#e7eeef' });
    const detail = machine.type === 'constant' ? formatValue(machine.config.value) : machine.type === 'arithmetic' || machine.type === 'comparator' ? `A ${machine.config.operation} B` : machine.type === 'join' ? String(machine.config.mode) : machine.id;
    const caption = this.add.text(43, 34, detail.length > 17 ? `${detail.slice(0, 15)}…` : detail, { fontFamily: 'Consolas, monospace', fontSize: '11px', color: '#82969f' });
    container.add([shadow, border, stripe, icon, title, caption]);
    container.setInteractive(new Phaser.Geom.Rectangle(90, 58, 180, 116), Phaser.Geom.Rectangle.Contains);
    this.input.setDraggable(container);
    container.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.leftButtonDown() && !this.space) this.state.select(machine.id); });
    for (const direction of ['input', 'output'] as const) {
      d.ports.filter(p => p.direction === direction).forEach((port, index) => {
        const x = direction === 'input' ? 0 : 180, y = 68 + index * 24;
        const circle = this.add.circle(x, y, 6, 0x10191f).setStrokeStyle(2, d.color).setInteractive(new Phaser.Geom.Circle(6, 6, 13), Phaser.Geom.Circle.Contains);
        const label = this.add.text(direction === 'input' ? 14 : 165, y - 5, port.label, { fontFamily: 'Consolas, monospace', fontSize: '10px', color: '#aab9c0' }).setOrigin(direction === 'input' ? 0 : 1, 0);
        circle.on('pointerover', () => { circle.setFillStyle(d.color); this.game.canvas.style.cursor = 'crosshair'; });
        circle.on('pointerout', () => { circle.setFillStyle(0x10191f); this.game.canvas.style.cursor = 'default'; });
        circle.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation(); if (!p.leftButtonDown() || this.state.mode !== 'EDIT' || this.space) return;
          if (direction === 'output') { this.pending = { machine: machine.id, port: port.id }; this.state.report('Выберите входной порт другой машины. Esc — отменить.'); }
          else if (this.pending) this.completeConnection(machine.id, port.id);
          else this.state.report('Начните соединение с выходного порта справа.');
        });
        container.add([circle, label]);
      });
    }
    this.nodes.set(machine.id, { container, border });
  }
  private completeConnection(machine: string, port: string): void { if (!this.pending) return; const from = this.pending; this.pending = undefined; this.preview.clear(); this.state.connect(from, { machine, port }); }
  cancelConnection(): void { this.pending = undefined; this.preview.clear(); }
  private decorate(): void { this.nodes.forEach((view, id) => view.border.setStrokeStyle(this.state.selected === id ? 2 : 1, this.state.selected === id ? 0x8df5c4 : 0x3b4c57)); }
  private portPosition(id: string, port: string, direction: 'input' | 'output'): Phaser.Math.Vector2 | undefined {
    const machine = this.state.graph.machines.find(m => m.id === id), view = this.nodes.get(id);
    if (!machine || !view) return;
    const i = registry.get(machine.type).ports.filter(p => p.direction === direction).findIndex(p => p.id === port);
    return new Phaser.Math.Vector2(view.container.x + (direction === 'output' ? 180 : 0), view.container.y + 68 + i * 24);
  }
  private curve(edge: Connection): Phaser.Curves.CubicBezier | undefined {
    const a = this.portPosition(edge.from.machine, edge.from.port, 'output'), b = this.portPosition(edge.to.machine, edge.to.port, 'input'); if (!a || !b) return;
    const bend = Math.max(60, Math.abs(b.x - a.x) * .45);
    return new Phaser.Curves.CubicBezier(a, new Phaser.Math.Vector2(a.x + bend, a.y), new Phaser.Math.Vector2(b.x - bend, b.y), b);
  }
  private drawWires(): void {
    this.wires.clear();
    for (const edge of this.state.graph.connections) {
      const curve = this.curve(edge); if (!curve) continue;
      const chosen = edge.id === this.state.selectedConnection;
      this.wires.lineStyle(chosen ? 3 : 2, chosen ? 0xf4ba69 : 0x4b7d79, .9); curve.draw(this.wires, 40);
      const p = curve.getPoint(.56), tangent = curve.getTangent(.56).angle();
      this.wires.fillStyle(chosen ? 0xf4ba69 : 0x74b4a8, 1);
      this.wires.fillTriangle(p.x + Math.cos(tangent) * 6, p.y + Math.sin(tangent) * 6, p.x + Math.cos(tangent + 2.5) * 5, p.y + Math.sin(tangent + 2.5) * 5, p.x + Math.cos(tangent - 2.5) * 5, p.y + Math.sin(tangent - 2.5) * 5);
    }
  }
  private animateEvent(event: SimulationEvent): void {
    if (event.kind === 'error') { this.clearPackets(); return; }
    if (event.kind === 'process' && event.machineId) {
      const view = this.nodes.get(event.machineId); if (view) { view.border.setFillStyle(0x304a44); this.tweens.addCounter({ from: 1, to: 0, duration: 360, onComplete: () => { if (view.border.active) view.border.setFillStyle(0x1b2830); } }); }
    }
    if ((event.kind === 'emit' || event.kind === 'transfer') && event.packet && (this.state.speed !== 0 || this.state.paused)) {
      const existing = this.packets.find(p => p.id === event.packet!.id);
      if (existing) { existing.moving = event.kind === 'transfer'; existing.force = this.state.paused; return; }
      const edge = this.state.graph.connections.find(c => c.id === event.packet!.currentConnection); const curve = edge ? this.curve(edge) : undefined; if (!curve) return;
      const value = formatValue(event.packet.value), text = value.length > 20 ? `${value.slice(0, 18)}…` : value;
      const label = this.add.text(0, -19, text, { fontFamily: 'monospace', fontSize: '12px', color: '#d2ffe7', backgroundColor: '#183a30', padding: { x: 7, y: 5 } }).setOrigin(.5, 1);
      const dot = this.add.circle(0, 0, 5, 0x8af0bf); const object = this.add.container(curve.p0.x, curve.p0.y, [dot, label]).setDepth(30);
      this.packets.push({ id: event.packet.id, object, curve, progress: 0, duration: this.state.paused ? 260 : 300 / this.state.speed, force: this.state.paused, moving: event.kind === 'transfer' });
    }
  }
  private clearPackets(): void { this.packets.forEach(p => p.object.destroy()); this.packets = []; }
  private drawGrid(): void {
    if (!this.gridGraphic) return;
    const cam = this.cameras.main; cam.preRender();
    const first = this.world(0, 0), last = this.world(cam.width, cam.height);
    const left = first.x, top = first.y, right = last.x, bottom = last.y;
    this.gridGraphic.clear(); this.gridGraphic.fillStyle(0x33434c, .65);
    const step = cam.zoom < .6 ? 48 : 24;
    for (let x = Math.floor(left / step) * step; x <= right; x += step) for (let y = Math.floor(top / step) * step; y <= bottom; y += step) this.gridGraphic.fillCircle(x, y, .9 / cam.zoom);
  }
  world(x: number, y: number): Phaser.Math.Vector2 { return this.cameras.main.getWorldPoint(x, y); }
  addAtCenter(type: string): void { const p = this.world(this.scale.width / 2 - 90, this.scale.height / 2 - 58); const offset = this.state.graph.machines.length % 4 * 24; this.state.addMachine(type, p.x + offset, p.y + offset); }
  zoom(factor: number, x = this.scale.width / 2, y = this.scale.height / 2): void {
    const cam = this.cameras.main, before = this.world(x, y); cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, .35, 1.75)); cam.preRender(); const after = this.world(x, y); cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y; this.drawGrid();
    this.host.dataset.zoom = `${Math.round(cam.zoom * 100)}%`;
  }
  fit(): void {
    const nodes = this.state.graph.machines; const cam = this.cameras.main;
    if (nodes.length) { const left = Math.min(...nodes.map(m => m.x)) - 70, top = Math.min(...nodes.map(m => m.y)) - 70; const width = Math.max(...nodes.map(m => m.x)) + 250 - left, height = Math.max(...nodes.map(m => m.y)) + 186 - top; cam.setZoom(Math.min(1, cam.width / width, cam.height / height)); cam.centerOn(left + width / 2, top + height / 2); }
    else { cam.setZoom(1); cam.setScroll(0, 0); }
    this.drawGrid();
  }
  update(_time: number, delta: number): void {
    this.state.advance(delta);
    if (this.state.speed === 0 && !this.state.paused && this.packets.length) this.clearPackets();
    for (const p of this.packets) { if (p.moving && (!this.state.paused || p.force)) p.progress = Math.min(1, p.progress + delta / p.duration); const pos = p.curve.getPoint(p.progress); p.object.setPosition(pos.x, pos.y); if (p.progress >= 1) p.object.destroy(); }
    this.packets = this.packets.filter(p => p.progress < 1);
  }
}

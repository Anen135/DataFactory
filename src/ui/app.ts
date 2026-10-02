import { levels } from '../content/levels';
import { examples } from '../content/examples';
import { createProgram } from '../code/ir';
import { JavaScriptGenerator, PythonGenerator } from '../code/generators';
import { validateGraph } from '../core/graph';
import { parseValue } from '../core/values';
import type { FactoryScene } from '../renderer/factory-scene';
import type { GameState, StateChange } from '../state/game-state';
import { $, escape } from './helpers';
import { inspector, mapPanel, palette, testsPanel } from './panels';
import { template } from './template';
import { tutorialState } from './tutorial';

type PanelName = 'palette' | 'inspector' | 'graph' | 'bottom';
const panelLabels: Record<PanelName, string> = { palette: 'Node Palette', inspector: 'Inspector', graph: 'Graph Canvas', bottom: 'нижнюю панель' };

export class App {
  private scene?: FactoryScene;
  private tab = 'console';
  private language = 'Python';
  private pending = false;
  private fileMode: 'project' | 'graph' = 'graph';
  private collapsedPanels: Record<PanelName, boolean> = { palette: false, inspector: false, graph: false, bottom: false };

  constructor(readonly state: GameState) {
    $('#app').innerHTML = template;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('data-factory:panels') ?? '{}');
      if (saved && typeof saved === 'object') for (const panel of Object.keys(this.collapsedPanels) as PanelName[]) {
        this.collapsedPanels[panel] = (saved as Record<string, unknown>)[panel] === true;
      }
    } catch { /* Layout preferences are optional when storage is unavailable. */ }
    this.renderPanelLayout();
    this.bind();
    this.renderAll();
    state.subscribe(change => this.changed(change));
  }
  attachScene(scene: FactoryScene): void { this.scene = scene; }
  private closeModal(): void { $<HTMLDialogElement>('#modal').close(); }
  private setPanelCollapsed(panel: PanelName, collapsed: boolean): void {
    if (this.collapsedPanels[panel] === collapsed) return;
    this.collapsedPanels[panel] = collapsed;
    this.renderPanelLayout();
    try { localStorage.setItem('data-factory:panels', JSON.stringify(this.collapsedPanels)); } catch { /* Keep the in-memory layout. */ }
    if (panel === 'graph' && !collapsed) requestAnimationFrame(() => requestAnimationFrame(() => this.scene?.fit()));
  }
  private renderPanelLayout(): void {
    for (const panel of Object.keys(this.collapsedPanels) as PanelName[]) {
      const collapsed = this.collapsedPanels[panel], button = $<HTMLButtonElement>(`[data-panel="${panel}"]`);
      $('#app').classList.toggle(`${panel}-collapsed`, collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      button.title = `${collapsed ? 'Развернуть' : 'Свернуть'} ${panelLabels[panel]}`;
      button.setAttribute('aria-label', button.title);
      button.textContent = collapsed ? '+' : '−';
      document.getElementById(button.getAttribute('aria-controls')!)!.hidden = collapsed;
    }
  }
  private bind(): void {
    document.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const panel = target.closest<HTMLElement>('[data-panel]')?.dataset.panel as PanelName | undefined;
      if (panel && Object.hasOwn(this.collapsedPanels, panel)) this.setPanelCollapsed(panel, !this.collapsedPanels[panel]);
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.action(action);
      const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab) { this.setPanelCollapsed('bottom', false); this.tab = tab; this.renderTab(); }
      const level = target.closest<HTMLElement>('[data-level]')?.dataset.level;
      if (level) { this.state.loadLevel(level); this.closeModal(); }
      const project = target.closest<HTMLElement>('[data-project]')?.dataset.project;
      if (project) { this.state.openProject(project); this.closeModal(); }
      const example = target.closest<HTMLElement>('[data-example]')?.dataset.example;
      if (example) {
        const value = examples.find(e => e.id === example);
        if (value) { this.state.newProject(value.name, value.graph, value.input); this.closeModal(); }
      }
      const machine = target.closest<HTMLElement>('[data-machine]')?.dataset.machine;
      if (machine) this.scene?.addAtCenter(machine);
    });
    document.addEventListener('submit', event => {
      if ((event.target as HTMLElement).id !== 'new-project-form') return;
      event.preventDefault();
      const name = $<HTMLInputElement>('#new-project-name').value.trim();
      if (name) { this.state.newProject(name); this.closeModal(); }
    });
    document.addEventListener('change', event => {
      const target = event.target as HTMLInputElement;
      if (target.id === 'speed') this.state.speed = Number(target.value);
      if (target.id === 'sample') { this.state.sample = Number(target.value); this.renderTab(); }
      if (target.id === 'language') { this.language = target.value; this.renderTab(); }
      if (target.id === 'runtime-input') {
        try { this.state.setInput(parseValue(target.value)); target.classList.remove('invalid'); }
        catch (error) { target.classList.add('invalid'); this.state.report((error as Error).message); }
      }
      if (target.dataset.config && this.state.selected) {
        try { this.state.configure(this.state.selected, target.dataset.config, target.dataset.kind === 'value' ? parseValue(target.value) : target.value); }
        catch (error) { this.state.report((error as Error).message); }
        $('#inspector-content').innerHTML = inspector(this.state);
      }
    });
    $('#palette-list').addEventListener('dragstart', event => {
      const e = event as DragEvent, type = (e.target as HTMLElement).closest<HTMLElement>('[data-machine]')?.dataset.machine;
      if (type && e.dataTransfer) { e.dataTransfer.setData('application/x-data-factory', type); e.dataTransfer.effectAllowed = 'copy'; }
    });
    $('#game').addEventListener('dragover', event => event.preventDefault());
    $('#game').addEventListener('drop', event => {
      event.preventDefault();
      const e = event as DragEvent, type = e.dataTransfer?.getData('application/x-data-factory');
      if (type && this.scene) {
        const rect = $('#game').getBoundingClientRect(), p = this.scene.world(e.clientX - rect.left, e.clientY - rect.top);
        this.state.addMachine(type, p.x - 90, p.y - 45);
      }
    });
    $('#import-file').addEventListener('change', event => {
      const element = event.target as HTMLInputElement, file = element.files?.[0], mode = this.fileMode;
      if (file) {
        if (file.size > 2_000_000) this.state.report('Файл слишком большой (максимум 2 МБ).');
        else void file.text().then(text => {
          if (mode === 'project') this.state.openFile(text, file.name);
          else this.state.import(text);
          this.closeModal();
        }).catch(error => this.state.report((error as Error).message));
      }
      element.value = '';
    });
    document.addEventListener('keydown', event => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') || $<HTMLDialogElement>('#modal').open) return;
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); if (event.shiftKey) this.state.redo(); else this.state.undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); this.state.save(); this.renderStatus(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.state.removeSelected(); }
      else if (event.key === 'Escape') { this.scene?.cancelConnection(); this.state.select(); }
      else if (event.code === 'KeyF') this.scene?.fit();
      else if (event.code === 'KeyR') this.action('run');
      else if (event.code === 'Period') this.action('step');
    });
  }
  private action(action: string): void {
    const s = this.state;
    if ((action === 'run' || action === 'step') && s.workspace === 'project' && $('#runtime-input').classList.contains('invalid')) {
      this.state.report('Исправьте Input JSON перед запуском.');
      $('#runtime-input').focus();
      return;
    }
    switch (action) {
      case 'run': s.run(); break;
      case 'step': s.step(); break;
      case 'edit': s.edit(); break;
      case 'undo': s.undo(); break;
      case 'redo': s.redo(); break;
      case 'clear': s.clear(); break;
      case 'remove': s.removeSelected(); break;
      case 'fit': this.scene?.fit(); break;
      case 'zoom-in': this.scene?.zoom(1.2); break;
      case 'zoom-out': this.scene?.zoom(1 / 1.2); break;
      case 'check': this.setPanelCollapsed('bottom', false); s.checkTests(); this.tab = 'tests'; this.renderTab(); break;
      case 'close-modal': this.closeModal(); break;
      case 'new-project':
        this.openModal('New Project', '<form id="new-project-form"><div class="project-template"><strong>Blank Factory</strong><p>Пустой граф. Все ноды доступны. Входные данные задаёте вы.</p></div><label class="config-field">Название проекта<input id="new-project-name" value="Blank Factory" maxlength="100" required /></label><button class="primary dialog-primary" type="submit">Create Project</button></form>');
        break;
      case 'open-project':
        s.save();
        this.openModal('Open Project', `<button data-action="open-file" class="primary">Open .df / JSON file</button><h3 class="dialog-section">Сохранённые проекты</h3><div class="project-list">${s.persistence.projects().map(p => `<button data-project="${escape(p.id)}"><strong>${escape(p.name)}.df</strong><small>${escape(new Date(p.updatedAt).toLocaleString())}</small></button>`).join('') || '<p class="muted">Нет сохранённых проектов.</p>'}</div>`);
        break;
      case 'open-file': this.fileMode = 'project'; $<HTMLInputElement>('#import-file').click(); break;
      case 'import': this.fileMode = 'graph'; $<HTMLInputElement>('#import-file').click(); break;
      case 'export': {
        const url = URL.createObjectURL(new Blob([s.exportProject()], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `${s.workspace === 'tutorial' ? s.level.name : s.project.name}.df`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); break;
      }
      case 'tutorial': case 'map': this.openModal('Tutorial Campaign', mapPanel(s)); break;
      case 'examples':
        this.openModal('Examples', `<p>Откройте пример как самостоятельный проект и изменяйте его.</p><div class="project-list">${examples.map(e => `<button data-example="${e.id}"><strong>${escape(e.name)}</strong><small>${escape(e.description)}</small></button>`).join('')}</div>`);
        break;
      case 'next': { const next = levels[levels.indexOf(s.level) + 1]; if (next) s.loadLevel(next.id); else this.openModal('Tutorial Campaign', mapPanel(s)); break; }
      case 'hint': this.openModal('Подсказка', `<p>${escape(s.level.hint)}</p>`); break;
      case 'help':
        this.openModal('DATA FACTORY', '<div class="help-grid"><div><h3>Постройте программу</h3><p>Добавляйте ноды из Node Palette. Соединяйте выходной порт справа с входным слева. Inspector показывает параметры и данные выбранной ноды.</p><p>Задайте Input JSON, нажмите RUN или Step. Stop возвращает к редактированию. Console показывает выход, Variables — состояние нод, Execution — события.</p></div><div><h3>Управление</h3><p>Правая кнопка / Пробел + мышь — перемещение.<br>Колесо — масштаб. F — вписать граф.<br>Delete — удалить. Ctrl+Z — отменить.<br>Ctrl+Shift+Z — повторить. Ctrl+S — сохранить.<br>R — запуск / пауза. Точка — шаг.</p><p>Проекты сохраняются в этом браузере. Export создаёт переносимый файл .df. Tutorial Campaign доступна из верхнего меню.</p></div></div>');
        break;
    }
  }
  private changed(change: StateChange): void {
    if (change.kind === 'selection') { $('#inspector-content').innerHTML = inspector(this.state); return; }
    if (change.kind === 'runtime') {
      if (!this.pending) {
        this.pending = true;
        setTimeout(() => { this.pending = false; this.renderControls(); $('#inspector-content').innerHTML = inspector(this.state); if (this.tab !== 'code' && this.tab !== 'tests') this.renderTab(); this.renderStatus(); }, 60);
      }
      return;
    }
    if (change.kind === 'message') { this.renderStatus(); this.renderTab(); return; }
    if (change.kind === 'workspace') this.tab = 'console';
    this.renderAll();
  }
  private renderAll(): void {
    const s = this.state, training = s.workspace === 'tutorial';
    const name = training ? s.level.name : s.project.name;
    $('#project-name').textContent = `${name}.df`;
    $('#workspace-kind').textContent = training ? 'TUTORIAL CAMPAIGN' : 'PROJECT';
    $('#level-name').textContent = name;
    $('#level-topic').textContent = training ? s.level.topic : 'GRAPH WORKSPACE';
    $('#machine-count').textContent = String(s.availableMachines.length);
    $('#graph-count').textContent = `${s.graph.machines.length} nodes · ${s.graph.connections.length} connections`;
    $('#empty-state').hidden = !!s.graph.machines.length;
    $('#palette-list').innerHTML = palette(s);
    $('#inspector-content').innerHTML = inspector(s);
    $('#tests-tab').hidden = !training; $('#check-btn').hidden = !training;
    $('#input-label').hidden = training;
    $<HTMLInputElement>('#runtime-input').value = JSON.stringify(s.input);
    $('#runtime-input').classList.remove('invalid');
    const tutorial = tutorialState(s); $('#tutorial').hidden = !tutorial;
    if (tutorial) $('#tutorial').innerHTML = `<span class="tutorial-icon">◇</span><div><small>TUTORIAL <span>${Math.min(tutorial.current + 1, tutorial.count)} / ${tutorial.count}</span></small><p>${escape(tutorial.text)}</p></div>`;
    this.renderControls(); this.renderTab(); this.renderStatus();
  }
  private renderControls(): void {
    const s = this.state, running = s.mode === 'RUN' && !s.simulation?.done;
    $('#mode').textContent = s.mode === 'EDIT' ? 'EDIT' : s.simulation?.error ? 'ERROR' : s.simulation?.done ? 'DONE' : s.paused ? 'PAUSED' : 'RUNNING';
    $('#mode').classList.toggle('running', running);
    $('#run-btn').textContent = running ? s.paused ? '▶ Resume' : 'Ⅱ Pause' : '▶ RUN';
    $<HTMLButtonElement>('#edit-btn').disabled = s.mode === 'EDIT';
    $<HTMLButtonElement>('#undo-btn').disabled = !s.canUndo; $<HTMLButtonElement>('#redo-btn').disabled = !s.canRedo;
    $<HTMLButtonElement>('#check-btn').disabled = running;
    $('#stats-line').textContent = `${s.simulation?.operations ?? 0} operations · ${s.simulation?.ticks ?? 0} ticks`;
    document.querySelectorAll<HTMLButtonElement>('[data-machine], [data-action="clear"], [data-action="import"]').forEach(button => { button.disabled = s.mode === 'RUN'; });
    $<HTMLInputElement>('#runtime-input').disabled = s.mode === 'RUN';
    const sample = document.querySelector<HTMLSelectElement>('#sample'); if (sample) sample.disabled = s.mode === 'RUN';
  }
  private renderTab(): void {
    const s = this.state;
    if (this.tab === 'tests' && s.workspace !== 'tutorial') this.tab = 'console';
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
    $('#test-count').textContent = s.result ? `${s.result.tests.filter(t => t.passed).length}/${s.result.tests.length}` : String(s.level.tests.length);
    let content = '';
    if (this.tab === 'tests') content = testsPanel(s);
    else if (this.tab === 'console') content = `<div class="console">${s.log.length ? s.log.map(line => `<div><span>›</span> ${escape(line)}</div>`).join('') : '<span class="muted">Console готова. Запустите граф, чтобы увидеть события и выходные данные.</span>'}</div>`;
    else if (this.tab === 'code') {
      let code: string;
      try { code = (this.language === 'Python' ? new PythonGenerator() : new JavaScriptGenerator()).generate(createProgram(s.graph)); }
      catch (error) { code = `${this.language === 'Python' ? '#' : '//'} ${(error as Error).message.replaceAll('\n', '\n' + (this.language === 'Python' ? '#' : '//') + ' ')}`; }
      content = `<div class="code-toolbar"><span>GRAPH → CODE</span><select id="language" aria-label="Язык Code View"><option ${this.language === 'Python' ? 'selected' : ''}>Python</option><option ${this.language === 'JavaScript' ? 'selected' : ''}>JavaScript</option></select></div><pre class="code-view"><code>${escape(code)}</code></pre>`;
    } else if (this.tab === 'variables') {
      const entries = [...s.simulation?.snapshots.entries() ?? []];
      content = `<div class="runtime-table"><div class="runtime-row table-head"><span>NODE</span><span>INPUTS</span><span>OUTPUTS / STATE</span></div>${entries.map(([id, snap]) => `<div class="runtime-row"><code>${escape(id)}</code><code>${escape(JSON.stringify(snap.inputs))}</code><code>${escape(JSON.stringify({ ...snap.outputs, ...snap.state }))}</code></div>`).join('') || '<p class="panel-empty">Запустите граф, чтобы увидеть значения.</p>'}</div>`;
    } else if (this.tab === 'execution') {
      content = `<div class="runtime-table"><div class="runtime-row table-head"><span>TICK</span><span>EVENT / NODE</span><span>VALUE</span></div>${s.events.map(e => `<div class="runtime-row"><code>${e.tick}</code><span>${escape(e.kind)} ${escape(e.machineId ?? '')}</span><code>${escape(e.packet ? JSON.stringify(e.packet.value) : e.message ?? '')}</code></div>`).join('') || '<p class="panel-empty">Step выполняет одно событие. История появится после запуска.</p>'}<p class="muted">Последние ${s.events.length} событий (до 300).</p></div>`;
    } else if (this.tab === 'errors') {
      const errors = [...new Set([...s.graph.machines.length ? validateGraph(s.graph) : [], ...s.simulation?.error ? [s.simulation.error] : [], ...s.executionError ? [s.executionError] : []])];
      content = `<div class="console">${errors.length ? errors.map(e => `<div class="fail">${escape(e)}</div>`).join('') : '<span class="muted">Ошибок не обнаружено.</span>'}</div>`;
    } else if (this.tab === 'profiler') {
      content = `<div class="profiler-metrics"><div><small>NODE OPERATIONS</small><strong>${s.simulation?.operations ?? 0}</strong></div><div><small>RUNTIME TICKS</small><strong>${s.simulation?.ticks ?? 0}</strong></div><div><small>NODES COMPLETED</small><strong>${[...s.simulation?.snapshots.values() ?? []].filter(v => v.status === 'done').length} / ${s.graph.machines.length}</strong></div><div><small>OUTPUT VALUES</small><strong>${s.simulation?.output.length ?? 0}</strong></div></div><p class="panel-empty">Счётчики текущего запуска. Тик — одно событие runtime.</p>`;
    }
    $('#tab-content').innerHTML = content;
    if (this.tab === 'console' || this.tab === 'execution') $('#tab-content').scrollTop = $('#tab-content').scrollHeight;
  }
  private renderStatus(): void {
    $('#status-message').textContent = this.state.message;
    $('#status-message').title = this.state.message;
    $('#save-status').textContent = this.state.persistence.warning ? '● Not saved' : '● Saved locally';
  }
  private openModal(title: string, content: string): void {
    $('#modal-title').textContent = title; $('#modal-content').innerHTML = content; $<HTMLDialogElement>('#modal').showModal();
  }
}

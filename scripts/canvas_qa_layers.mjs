import { runCanvasQaScenario } from './canvas_qa_scenario_runner.mjs';

runCanvasQaScenario('layers', [
  'bootstrap',
  'layer-panel-dnd',
  'layer-multi-drag',
  'selection-toolbar',
  'multi-select',
]);

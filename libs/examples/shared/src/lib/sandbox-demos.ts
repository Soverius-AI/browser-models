/**
 * What a model would write for CopilotKit's `generateSandboxedUi` tool (Open Generative UI):
 * a small page as CSS, HTML and JavaScript. The demo engine "writes" these. The parameter order
 * is the one the tool asks for.
 */
export interface SandboxDemo {
  readonly initialHeight: number;
  readonly placeholderMessages: readonly string[];
  readonly css: string;
  readonly html: string;
  readonly jsFunctions: string;
  readonly jsExpressions: readonly string[];
}

/** "Build a tip calculator": plain HTML with two inputs and a live total. */
export const tipCalculator: SandboxDemo = {
  initialHeight: 260,
  placeholderMessages: ['Designing a tip calculator…'],
  css: `body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; color: #04131d; }
.card { border: 1px solid #d4dce2; border-radius: 8px; padding: 16px; max-width: 320px; }
h2 { margin: 0 0 12px; font-size: 18px; }
label { display: block; margin-bottom: 10px; font-size: 14px; }
input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d4dce2; border-radius: 6px; font-size: 14px; }
.total { margin-top: 12px; font-weight: 600; color: #004871; }`,
  html: `<div class="card">
  <h2>Tip calculator</h2>
  <label>Bill <input id="bill" type="number" value="40" min="0"></label>
  <label>Tip % <input id="tip" type="number" value="15" min="0"></label>
  <div class="total" id="total"></div>
</div>`,
  jsFunctions: `function updateTotal() {
  const bill = Number(document.getElementById('bill').value);
  const tip = Number(document.getElementById('tip').value);
  document.getElementById('total').textContent = 'Total: ' + (bill * (1 + tip / 100)).toFixed(2);
}
function initializeCalculator() {
  document.getElementById('bill').addEventListener('input', updateTotal);
  document.getElementById('tip').addEventListener('input', updateTotal);
  updateTotal();
}`,
  jsExpressions: ['initializeCalculator()'],
};

/**
 * "Draw a chart with Chart.js": loads Chart.js from a CDN inside the sandbox, draws a bar chart
 * of sample data, and a button switches it to a line chart.
 */
export const barChart: SandboxDemo = {
  initialHeight: 380,
  placeholderMessages: ['Loading Chart.js…', 'Drawing the chart…'],
  css: `body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; color: #04131d; }
.card { border: 1px solid #d4dce2; border-radius: 8px; padding: 16px; max-width: 560px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
h2 { margin: 0; font-size: 18px; }
button { padding: 6px 10px; border: 1px solid #004871; border-radius: 6px; background: #fff; color: #004871; font-size: 13px; cursor: pointer; }
p { margin: 8px 0 0; font-size: 12px; color: #5b6b76; }`,
  html: `<head><script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js"></script></head>
<div class="card">
  <div class="head">
    <h2>Visitors per day</h2>
    <button id="toggle" type="button">Show as line</button>
  </div>
  <canvas id="chart" height="140"></canvas>
  <p id="status">Sample data, drawn with Chart.js inside the sandbox.</p>
</div>`,
  jsFunctions: `let chart;
let type = 'bar';
function chartLoaded() {
  return new Promise((resolve) => {
    const check = () => (window.Chart ? resolve() : setTimeout(check, 50));
    check();
  });
}
function draw() {
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('chart'), {
    type,
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{ label: 'Visitors', data: [120, 190, 150, 220, 260, 180, 90], backgroundColor: '#0071a9', borderColor: '#dd6300' }],
    },
    options: { animation: false, plugins: { legend: { display: false } } },
  });
  document.getElementById('status').dataset.chart = type;
}
function initializeChart() {
  document.getElementById('toggle').addEventListener('click', () => {
    type = type === 'bar' ? 'line' : 'bar';
    document.getElementById('toggle').textContent = type === 'bar' ? 'Show as line' : 'Show as bars';
    draw();
  });
  return chartLoaded().then(draw);
}`,
  jsExpressions: ['initializeChart()'],
};

/**
 * Design guidelines for the model, for CopilotKit's `openGenerativeUI.designSkill`. CopilotKit's
 * own are written for large models; these are short and concrete, so that a small model in the
 * browser has a pattern to follow.
 */
export const sandboxDesignSkill = `Rules for generateSandboxedUi. Keep the page small.
- css: a few plain rules.
- html: plain HTML, single quotes for attributes.
- jsFunctions: define EVERY function you call. Never leave it empty when jsExpressions calls a function.
- jsExpressions: only calls of functions from jsFunctions, for example ["draw()"].
- Invent sensible sample data when the user gives none. Do not ask for data.

To draw a chart, use exactly this pattern:
html: <script src='https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js'></script><canvas id='chart'></canvas>
jsFunctions: function draw() { if (!window.Chart) { setTimeout(draw, 50); return; } new Chart(document.getElementById('chart'), { type: 'bar', data: { labels: ['A', 'B', 'C'], datasets: [{ label: 'Values', data: [3, 5, 2] }] } }); }
jsExpressions: ["draw()"]`;

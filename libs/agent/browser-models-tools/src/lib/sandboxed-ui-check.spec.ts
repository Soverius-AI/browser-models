import { SandboxedUiCheck } from './sandboxed-ui-check.ts';

const check = (args: Record<string, unknown>) =>
  new SandboxedUiCheck().check(args);

describe('SandboxedUiCheck', () => {
  it('accepts a page whose script finds its elements', () => {
    expect(
      check({
        html: '<h2>Tip calculator</h2><input id="bill" value="40"><p id="total"></p>',
        jsFunctions:
          "function update() { document.querySelector('#total').textContent = 'Total: ' + (Number(document.getElementById('bill').value) * 1.15).toFixed(2); }",
        jsExpressions: ['update()'],
      }),
    ).toBeUndefined();
  });

  // Written by Gemma 4 E2B in Chrome: the script reads an input the page does not have.
  it('names the elements a script uses that the page lacks, and the ids it has', () => {
    expect(
      check({
        html: "<div id='app'><input type='number' id='billAmount' value='100'><button id='calculateBtn' onclick='calculateTip()'>Calculate</button><div id='tipResult'></div></div>",
        jsFunctions:
          "function calculateTip() { const bill = parseFloat(document.getElementById('billAmount').value); const tip = parseFloat(document.getElementById('tipPercentage').value); document.getElementById('tipResult').innerHTML = `${bill * tip}`; }",
        jsExpressions: ['calculateTip()'],
      }),
    ).toBe(
      'the script uses elements the html does not have: #tipPercentage; add them to the html or use the ids it has (#app, #billAmount, #calculateBtn, #tipResult)',
    );
  });

  // Also Gemma: a canvas, and a script for a form.
  it('rejects a script written for another page', () => {
    expect(
      check({
        html: "<canvas id='tipChart'></canvas>",
        jsFunctions:
          "function calculateTip() { const total = document.getElementById('billAmount').value; document.getElementById('tipResult').innerText = total; }",
      }),
    ).toMatch(/#billAmount, #tipResult; .*\(#tipChart\)/);
  });

  it('counts elements the script itself creates', () => {
    expect(
      check({
        html: '<div id="root"></div>',
        jsFunctions:
          "document.getElementById('root').innerHTML = '<span id=\"out\"></span>'; const b = document.createElement('b'); b.id = 'note'; b.setAttribute('id', 'later'); document.getElementById('out'); document.getElementById('note'); document.getElementById('later');",
      }),
    ).toBeUndefined();
  });

  it('skips ids built at run time', () => {
    expect(
      check({
        html: '<ul id="list"></ul>',
        jsFunctions:
          'for (const i of [1, 2]) document.getElementById(`item-${i}`).remove();',
      }),
    ).toBeUndefined();
  });

  it('rejects a script that does not parse, such as a copied placeholder', () => {
    expect(check({ html: '<p></p>', jsFunctions: '…' })).toMatch(
      /^the script does not parse \(.+\); send valid JavaScript$/,
    );
    expect(check({ html: '<p></p>', jsExpressions: ['update('] })).toMatch(
      /^the script does not parse/,
    );
  });

  it('allows await at the top of a script', () => {
    expect(
      check({
        html: '<p id="x"></p>',
        jsFunctions: "await Promise.resolve(); document.getElementById('x');",
      }),
    ).toBeUndefined();
  });

  it('reads ids in any case and without quotes', () => {
    expect(
      check({
        html: '<INPUT ID="bill"><p id=total class=big></p><b data-id="other"></b>',
        jsFunctions:
          "document.getElementById('total').textContent = document.getElementById('bill').value;",
      }),
    ).toBeUndefined();
    expect(
      check({
        html: '<p data-id="total"></p>',
        jsFunctions: "document.getElementById('total').textContent = '1';",
      }),
    ).toMatch(/#total; .*\(none\)/);
  });

  it('counts ids set with an object', () => {
    expect(
      check({
        html: '<div id="root"></div>',
        jsFunctions:
          "const a = Object.assign(document.createElement('p'), { id: 'a' }); const b = { \"id\": 'b' }; document.getElementById('a').remove(); document.getElementById('b').remove();",
      }),
    ).toBeUndefined();
  });

  it('skips lookups in comments', () => {
    expect(
      check({
        html: '<p id="x"></p>',
        jsFunctions:
          "// document.getElementById('old').remove();\n/* document.querySelector('#gone').remove(); */\nconst url = 'https://example.com/#a'; document.getElementById('x').textContent = url;",
      }),
    ).toBeUndefined();
  });

  it('allows a lookup whose result is tested before it is used', () => {
    for (const jsFunctions of [
      "const e = document.getElementById('legend'); if (e) e.remove();",
      "const e = document.getElementById('legend'); if (!e) return; e.remove();",
      "const e = document.querySelector('#legend'); e && e.remove();",
      "let e = document.getElementById('legend'); e?.remove();",
      "const e = document.getElementById('legend'); if (e !== null) e.remove();",
      "document.getElementById('legend')?.remove();",
      "if (document.getElementById('legend')) start();",
      "const e = document.getElementById('legend') || document.body;",
      "document.querySelectorAll('#legend li').forEach((li) => li.remove());",
    ]) {
      expect(check({ html: '<p></p>', jsFunctions })).toBeUndefined();
    }
  });

  it('rejects a missing element kept in a variable that is never tested', () => {
    expect(
      check({
        html: '<p id="total"></p>',
        jsFunctions:
          "const bill = document.getElementById('bill'); if (bill.value) document.getElementById('total').textContent = bill.value;",
      }),
    ).toMatch(/#bill; .*\(#total\)/);
  });

  it('does not take a comparison of an id for an element', () => {
    expect(
      check({
        html: '<button id="a"></button>',
        jsFunctions:
          "document.addEventListener('click', (e) => { if (e.target.id === 'b') document.getElementById('b').remove(); });",
      }),
    ).toMatch(/#b; .*\(#a\)/);
  });

  // `d.id = name` once counted as an element with the id "name".
  it('gives up when the script sets an id it computes', () => {
    for (const jsFunctions of [
      "const name = 'row'; const d = document.createElement('div'); d.id = name; document.getElementById('row').remove();",
      "for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.id = 'row-' + i; } document.getElementById('row-1').remove();",
      "const d = document.createElement('div'); d.setAttribute('id', key); document.getElementById('name').remove();",
      "list.innerHTML = [1, 2].map((i) => '<li id=\"item-' + i + '\"></li>').join(''); document.getElementById('item-1').remove();",
      'list.innerHTML = [1, 2].map((i) => `<li id="item-${i}"></li>`).join(""); document.getElementById("item-1").remove();',
    ]) {
      expect(
        check({ html: '<ul id="list"></ul>', jsFunctions }),
      ).toBeUndefined();
    }
  });

  it('does not take a variable named id for an element', () => {
    expect(
      check({
        html: '<p id="x"></p>',
        jsFunctions:
          "let id = name; if (a < b) id = other; document.getElementById('name').remove();",
      }),
    ).toBe(
      'the script uses elements the html does not have: #name; add them to the html or use the ids it has (#x)',
    );
  });
});

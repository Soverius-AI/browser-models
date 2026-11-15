import { ToolCallRepair } from './repair.ts';
import type { ToolSpec } from './tools.ts';

const tools: ToolSpec[] = [
  {
    name: 'getWeather',
    description: 'Weather for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' }, days: { type: 'integer' } },
      required: ['city'],
    },
  },
];

describe('ToolCallRepair', () => {
  it('passes a valid call through without repairs', async () => {
    const result = await new ToolCallRepair(tools).repair(
      '{"name":"getWeather","arguments":{"city":"Vienna"}}',
    );
    expect(result).toEqual({
      ok: true,
      call: { name: 'getWeather', arguments: { city: 'Vienna' } },
      steps: [],
    });
  });

  it('repairs broken JSON, the tool name and argument types', async () => {
    const raw = "{name: 'get_weather', arguments: {city: 'Vienna', days: '2',}";
    const result = await new ToolCallRepair(tools).repair(raw);
    expect(result).toEqual({
      ok: true,
      call: { name: 'getWeather', arguments: { city: 'Vienna', days: 2 } },
      steps: ['json', 'name', 'coerce'],
    });
  });

  it('accepts arguments sent as a JSON string', async () => {
    const raw = '{"name":"getWeather","arguments":"{\\"city\\":\\"Vienna\\"}"}';
    const result = await new ToolCallRepair(tools).repair(raw);
    expect(result.ok && result.call.arguments).toEqual({ city: 'Vienna' });
  });

  it('asks the model again when arguments stay invalid', async () => {
    const result = await new ToolCallRepair(tools, {
      reask: async () => '{"city":"Graz"}',
    }).repair('{"name":"getWeather","arguments":{}}');
    expect(result).toEqual({
      ok: true,
      call: { name: 'getWeather', arguments: { city: 'Graz' } },
      steps: ['reask'],
    });
  });

  it('uses the hook as a last resort', async () => {
    const result = await new ToolCallRepair(tools, {
      hook: () => ({ name: 'getWeather', arguments: { city: 'Linz' } }),
    }).repair('not a tool call');
    expect(result).toEqual({
      ok: true,
      call: { name: 'getWeather', arguments: { city: 'Linz' } },
      steps: ['hook'],
    });
  });

  it('explains unknown tools', async () => {
    const result = await new ToolCallRepair(tools).repair(
      '{"name":"sendEmail","arguments":{}}',
    );
    expect(result).toEqual({
      ok: false,
      error: 'Unknown tool "sendEmail". Available tools: getWeather.',
    });
  });
});

describe('ToolCallRepair.readPartial', () => {
  const repair = new ToolCallRepair([
    { name: 'getWeather', description: 'Weather' },
  ]);

  it('waits for the complete name, then repairs it', () => {
    expect(repair.readPartial('{"name": "get_wea')).toBeUndefined();
    expect(repair.readPartial('{"name": "get_weather"')).toBeUndefined();
    expect(repair.readPartial('{"name": "get_weather", "arg')).toEqual({
      name: 'getWeather',
      argumentsJson: '',
    });
    expect(repair.readPartial('{"name": "sendEmail", "arg')).toBe(undefined);
  });

  it('only returns arguments that the rest of the call cannot change', () => {
    const args =
      '{"city": "Wien \\"1\\" \\u00e9, {x}", "days": 12.5e3, "ok": true, "list": [1, {"a": null}, "b"], "empty": {}, "note": "tr"}';
    const raw = `{"name": "getWeather", "arguments": ${args}}`;
    const final = JSON.stringify(JSON.parse(args));

    let longest = '';
    for (let length = 1; length <= raw.length; length++) {
      const partial = repair.readPartial(raw.slice(0, length));
      if (!partial) continue;
      expect(final.startsWith(partial.argumentsJson)).toBe(true);
      expect(partial.argumentsJson.startsWith(longest)).toBe(true);
      longest = partial.argumentsJson;
    }
    // All but the closing brace, which is only certain once the call is complete.
    expect(longest).toBe(final.slice(0, -1));
  });
});

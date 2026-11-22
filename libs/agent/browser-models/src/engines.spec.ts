import {
  EngineKind,
  Engines,
  PromptApiEngine,
  TransformersJsEngine,
  WebLlmEngine,
  type BrowserEngine,
} from './engines.ts';

describe('Engines', () => {
  it('creates every engine by its kind, with its own options', () => {
    const nano = Engines.create(EngineKind.PromptApi, { sampling: 'balanced' });
    const gemma = Engines.create(EngineKind.WebLlm, 'gemma-MLC', {
      contextWindowSize: 16384,
    });
    const qwen = Engines.create(EngineKind.TransformersJs, 'onnx/qwen', {
      maxOutputTokens: 512,
    });

    expect(nano).toBeInstanceOf(PromptApiEngine);
    expect(gemma).toBeInstanceOf(WebLlmEngine);
    expect(gemma.contextWindowSize).toBe(16384);
    expect(qwen).toBeInstanceOf(TransformersJsEngine);
    expect(qwen.id).toBe('transformers:onnx/qwen');
  });

  it('narrows an engine by its kind', () => {
    const describe = (engine: BrowserEngine): string => {
      switch (engine.kind) {
        case EngineKind.PromptApi:
          return 'built into the browser';
        case EngineKind.WebLlm:
        case EngineKind.TransformersJs:
          return engine.id;
      }
    };

    expect(describe(new PromptApiEngine())).toBe('built into the browser');
    expect(describe(new WebLlmEngine('gemma-MLC'))).toBe('web-llm:gemma-MLC');
  });
});

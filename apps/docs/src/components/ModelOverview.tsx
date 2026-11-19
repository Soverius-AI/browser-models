import BrowserModelsMark from './BrowserModelsMark';

export default function ModelOverview() {
  return (
    <figure
      className="model-overview"
      aria-label="One API connects to three browser runtimes, with a server-model fallback"
    >
      <div className="model-overview__identity">
        <div className="model-overview__api">
          <BrowserModelsMark />
          <div>
            <strong>browser models</strong>
            <span>One API</span>
          </div>
        </div>
        <div className="model-overview__fallback">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M7 18H6a4 4 0 0 1-.7-7.9 7 7 0 0 1 13.5-1.7A5 5 0 0 1 19 18H7Z" />
          </svg>
          <span>Server fallback</span>
        </div>
      </div>

      <svg
        className="model-overview__branches"
        viewBox="0 0 48 160"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 40h22M22 24v112M22 24h26M22 80h26M22 136h26" />
      </svg>

      <div className="model-overview__runtimes">
        <div className="model-overview__runtime">
          <img
            className="logo--mono"
            src="/img/logos/googlechrome.svg"
            alt=""
          />
          <div>
            <strong>Prompt API</strong>
            <span>Browser-provided model</span>
          </div>
        </div>
        <div className="model-overview__runtime">
          <img className="logo--mono" src="/img/logos/webllm.png" alt="" />
          <div>
            <strong>WebLLM</strong>
            <span>WebGPU models</span>
          </div>
        </div>
        <div className="model-overview__runtime">
          <img className="logo--mono" src="/img/logos/huggingface.svg" alt="" />
          <div>
            <strong>Transformers.js</strong>
            <span>ONNX Runtime</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

export default function BrowserModelsMark({
  className = '',
}: {
  className?: string;
}) {
  return (
    <span className={`browser-models-mark ${className}`} aria-hidden="true">
      <img
        className="browser-models-mark__light"
        src="/img/browser-models-mark.svg"
        alt=""
      />
      <img
        className="browser-models-mark__dark"
        src="/img/browser-models-mark-dark.svg"
        alt=""
      />
    </span>
  );
}

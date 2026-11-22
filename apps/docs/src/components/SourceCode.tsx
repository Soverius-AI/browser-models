import { usePluginData } from '@docusaurus/useGlobalData';
import CodeBlock from '@theme/CodeBlock';
import { useState } from 'react';

/** Prism language per file extension; Vue single-file components read as HTML. */
const LANGUAGES: Readonly<Record<string, string>> = {
  ts: 'ts',
  tsx: 'tsx',
  html: 'html',
  vue: 'html',
};

const GITHUB = 'https://github.com/Soverius-AI/browser-models/blob/main';

/** The content of a repository file from the `source-files` plugin. */
export function useSourceFile(path: string): string {
  const files = usePluginData('source-files') as Record<string, string>;
  return files[path]?.trimEnd() ?? '';
}

/** One repository file, highlighted, titled with its path. */
export function SourceFile({ path }: { path: string }) {
  const code = useSourceFile(path);
  const extension = path.split('.').at(-1) ?? 'ts';
  return (
    <CodeBlock
      language={LANGUAGES[extension] ?? 'ts'}
      title={path}
      showLineNumbers
    >
      {code}
    </CodeBlock>
  );
}

/** Several repository files, one tab each. */
export default function SourceCode({ files }: { files: readonly string[] }) {
  const [open, setOpen] = useState(files[0] ?? '');
  return (
    <div className="source-code">
      <div className="source-code__files" role="tablist">
        {files.map((path) => (
          <button
            key={path}
            type="button"
            role="tab"
            aria-selected={path === open}
            className={`button button--sm ${path === open ? 'button--primary' : 'button--secondary'}`}
            onClick={() => setOpen(path)}
          >
            {path.split('/').at(-1)}
          </button>
        ))}
        <a
          className="source-code__github"
          href={`${GITHUB}/${open}`}
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </div>
      <SourceFile path={open} />
    </div>
  );
}

import { DiffToken } from '@/lib/diff/read-only';

export function DiffReadOnly({ tokens }: { tokens: DiffToken[] }) {
  return (
    <div className="card">
      <h3>差分表示（読み取り専用）</h3>
      <p className="badge">操作不可</p>
      <pre className="diff-block">
        {tokens.map((token, idx) => {
          if (token.kind === 'add') {
            return (
              <span key={idx} className="diff-add">
                +{token.value}
              </span>
            );
          }
          if (token.kind === 'remove') {
            return (
              <span key={idx} className="diff-remove">
                -{token.value}
              </span>
            );
          }
          return <span key={idx}>{token.value}</span>;
        })}
      </pre>
    </div>
  );
}

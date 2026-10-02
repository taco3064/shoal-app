import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function PolicyStep({ join }: { join: JoinState }) {
  const { policy } = join.inspection!;

  if (!policy) {
    return null;
  }

  return (
    <section className="quick-policy" aria-labelledby="quick-policy-title">
      <h3 id="quick-policy-title">Your Review Policy</h3>
      <p>
        Setup preserves README.md. Choose what you adopt; a Policy write needs
        its own confirmation.
      </p>
      <fieldset disabled={join.busy}>
        <legend>Choose your Policy</legend>
        {!policy.isDefault && (
          <label>
            <input
              type="radio"
              name="policy"
              checked={join.policyChoice === 'keep'}
              onChange={() => join.choosePolicy('keep')}
            />
            {' '}
            Keep current Policy (no write)
          </label>
        )}
        <label>
          <input
            type="radio"
            name="policy"
            checked={join.policyChoice === 'default'}
            onChange={() => join.choosePolicy('default')}
          />
          {' '}
          Use default Policy
          {' '}
          {policy.isDefault
            ? '(no write)'
            : '(replaces current README.md after confirmation)'}
        </label>
        <label>
          <input
            type="radio"
            name="policy"
            checked={join.policyChoice === 'custom'}
            onChange={() => join.choosePolicy('custom')}
          />
          {' '}
          Customize Policy
        </label>
      </fieldset>
      {join.policyChoice === 'custom' && (
        <label className="quick-editor">
          Policy Markdown
          <textarea
            value={join.content}
            onChange={(event) => join.editPolicy(event.target.value)}
            disabled={join.busy}
            rows={12}
            spellCheck={false}
          />
        </label>
      )}
      <h4>Markdown preview</h4>
      <div className="review-policy-content quick-preview">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {join.policyChoice === 'custom'
            ? join.content
            : join.policyChoice === 'default'
              ? policy.default
              : policy.current}
        </Markdown>
      </div>
      <button
        className="button"
        disabled={join.busy}
        onClick={() => void join.previewPolicy()}
      >
        Review Policy choice
      </button>
      {join.policyPlan && (
        <div className="quick-policy-confirm">
          <p>
            {join.policyPlan.changes
              ? 'Confirm a separate README.md commit using the exact content below.'
              : 'This choice preserves the current README.md without a commit.'}
          </p>
          <p>
            Inspected branch head:
            {' '}
            <code>{join.policyPlan.head}</code>
          </p>
          <details>
            <summary>Exact confirmed Markdown</summary>
            <pre>{join.policyPlan.content}</pre>
          </details>
          <button
            className="button primary"
            disabled={join.busy}
            onClick={join.confirmPolicy}
          >
            Confirm Policy choice
          </button>
        </div>
      )}
    </section>
  );
}

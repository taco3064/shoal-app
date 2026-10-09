import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ReviewPolicy({ markdown, policyUrl }: {
  markdown: string;
  policyUrl: string;
}) {
  const sourceDirectory = policyUrl.slice(0, -'README.md'.length);

  return (
    <div className="review-policy-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          h5: ({ children }) => <h6>{children}</h6>,
          h6: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children }) => (
            <a
              className="text-link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src?.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/')}
              alt={alt ?? ''}
              loading="lazy"
            />
          ),
        }}
        urlTransform={(value) => {
          const safe = defaultUrlTransform(value);

          if (!safe) {
            return '';
          }

          if (safe.startsWith('#')) {
            return `${policyUrl}${safe}`;
          }

          return /^(https?:|mailto:)/i.test(safe)
            ? safe
            : new URL(safe, sourceDirectory).href;
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

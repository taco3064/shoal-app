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

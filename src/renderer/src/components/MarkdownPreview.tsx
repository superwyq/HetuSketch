import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema, type Options as RehypeSanitizeOptions } from 'rehype-sanitize';

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const ALLOWED_IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);
const ALLOWED_DATA_IMAGE_PATTERN = /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);/i;

const sanitizeSchema: RehypeSanitizeOptions = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https', 'data']
  }
};

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

function isSafeUrl(value: string | undefined, allowedProtocols: Set<string>): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, 'https://hetusketch.local');
    return allowedProtocols.has(url.protocol);
  } catch {
    return false;
  }
}

function normalizeLinkHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return isSafeUrl(href, ALLOWED_URL_PROTOCOLS) ? href : undefined;
}

function normalizeImageSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('data:') && !ALLOWED_DATA_IMAGE_PATTERN.test(src)) return undefined;
  return isSafeUrl(src, ALLOWED_IMAGE_PROTOCOLS) ? src : undefined;
}

const components: Components = {
  a({ href, children, ...props }) {
    const safeHref = normalizeLinkHref(href);
    return safeHref ? (
      <a {...props} href={safeHref} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  img({ src, alt, ...props }) {
    const safeSrc = normalizeImageSrc(src);
    if (!safeSrc) return null;
    return <img {...props} src={safeSrc} alt={alt ?? ''} />;
  }
};

export function MarkdownPreview({ content, className = 'markdown-preview' }: MarkdownPreviewProps): React.JSX.Element {
  return (
    <div className={className}>
      <ReactMarkdown skipHtml rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

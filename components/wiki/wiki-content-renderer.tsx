'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';

const sanitizeSchema: Schema = {
  ...defaultSchema,
  // figure/figcaption: CKEditor wraps resized images + table captions in these.
  tagNames: [...(defaultSchema.tagNames ?? []), 'figure', 'figcaption'],
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), 'id'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id'],
    h4: [...(defaultSchema.attributes?.h4 ?? []), 'id'],
    h5: [...(defaultSchema.attributes?.h5 ?? []), 'id'],
    h6: [...(defaultSchema.attributes?.h6 ?? []), 'id'],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ['target', 'self', '_blank'],
      ['rel', 'noopener', 'noreferrer'],
    ],
    // className + style carry CKEditor's image width (style="width:NN%").
    figure: ['className', 'style'],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      ['loading', 'lazy'],
      'className',
      'style',
      'width',
      'height',
      ['src', /^https?:\/\//i, /^\/uploads\//, /^\/api\/wiki\/image\/wiki\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.(?:jpg|png|webp|gif)$/],
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

const components: Components = {
  a({ node, ...props }) {
    const href = props.href ?? '';
    const isExternal = /^https?:\/\//i.test(href);
    return (
      <a
        {...props}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
      />
    );
  },
  img({ node, ...props }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        alt={props.alt ?? ''}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
        }}
      />
    );
  },
};

interface Props {
  markdown: string;
}

export function WikiContentRenderer({ markdown }: Props) {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-img:rounded-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

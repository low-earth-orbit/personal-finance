"use client";

import { Container } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import classes from "./MethodologyDoc.module.css";

/**
 * Renders the full glide-path methodology note (the `docs/glide-path/methodology.md`
 * source, read at build time by the page) as a styled HTML page. GFM tables/strikethrough
 * are supported; headings get slug ids + click-to-copy anchor links. The markdown file
 * stays the single source of truth — editing it updates this page on the next build.
 */
export default function MethodologyDoc({ source }: { source: string }) {
  return (
    <Container size="md" py="xl">
      <div className={classes.prose}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeSlug,
            [rehypeAutolinkHeadings, { behavior: "wrap" }],
          ]}
        >
          {source}
        </ReactMarkdown>
      </div>
    </Container>
  );
}

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

type MarkdownContentProps = {
  markdown: string;
  className?: string;
  inline?: boolean;
};

function normalizeMathMarkdown(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  // Normalize common row-break typo in matrix-like input: "\ " -> "\\ ".
  let normalized = markdown.replace(/\\\s+/g, "\\\\ ");

  // Wrap bare LaTeX environments as display math blocks.
  normalized = normalized.replace(
    /(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})/g,
    (_, expr: string) => `$$${expr}$$`
  );

  // Support \(...\) and \[...\] delimiters.
  normalized = normalized
    .replace(/\\\((.+?)\\\)/gs, (_, expr: string) => `$${expr}$`)
    .replace(/\\\[(.+?)\\\]/gs, (_, expr: string) => `$$${expr}$$`);

  // If author forgot delimiters entirely, auto-wrap standalone LaTeX commands.
  if (!normalized.includes("$")) {
    normalized = normalized.replace(
      /(\\[a-zA-Z]+(?:\{[^{}]*\}|_[{]?[A-Za-z0-9+\-]+[}]?|\^[{]?[A-Za-z0-9+\-]+[}]?)*)/g,
      (_match: string, expr: string) => `$${expr}$`
    );
  }

  return normalized;
}

export function MarkdownContent({
  markdown,
  className,
  inline = false,
}: MarkdownContentProps) {
  const components = inline
    ? {
        p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
      }
    : undefined;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizeMathMarkdown(markdown)}
      </ReactMarkdown>
    </div>
  );
}

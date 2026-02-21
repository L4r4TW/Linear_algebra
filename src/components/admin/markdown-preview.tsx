import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type MarkdownPreviewProps = {
  markdown: string;
};

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  return (
    <div className="prose max-w-none rounded-lg border border-slate-200 bg-white p-4 text-slate-900">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {markdown || "_Nothing to preview yet._"}
      </ReactMarkdown>
    </div>
  );
}

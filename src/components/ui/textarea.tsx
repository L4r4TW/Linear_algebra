import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[140px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-offset-white placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

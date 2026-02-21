import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-offset-white placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

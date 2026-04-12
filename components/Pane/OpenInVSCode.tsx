"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface OpenInVSCodeProps {
  workingDirectory: string;
  className?: string;
}

function VSCodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.583 2.29a1.5 1.5 0 0 1 1.167.17l3.5 2.15A1.5 1.5 0 0 1 23 5.86v12.28a1.5 1.5 0 0 1-.75 1.3l-3.5 2.15a1.5 1.5 0 0 1-1.727-.13L9 14.54l-3.55 2.69a1 1 0 0 1-1.28-.05L2.42 15.53a1 1 0 0 1 0-1.46L5.7 12 2.42 9.93a1 1 0 0 1 0-1.46l1.75-1.65a1 1 0 0 1 1.28-.05L9 9.46l8.023-6.92a1.5 1.5 0 0 1 .56-.25ZM17.5 8.39l-5 4.11 5 4.11V8.39Z" />
    </svg>
  );
}

export function OpenInVSCode({
  workingDirectory,
  className,
}: OpenInVSCodeProps) {
  const { data: systemInfo } = useQuery({
    queryKey: ["system-info"],
    queryFn: () => fetch("/api/system").then((r) => r.json()),
    staleTime: Infinity,
  });

  const handleOpen = useCallback(() => {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";

    if (isLocal) {
      window.open(`vscode://file${workingDirectory}`, "_self");
    } else {
      const user = systemInfo?.user || "root";
      window.open(
        `vscode://vscode-remote/ssh-remote+${user}@${host}${workingDirectory}`,
        "_self"
      );
    }
  }, [workingDirectory, systemInfo]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
          className={cn("h-6 w-6", className)}
        >
          <VSCodeIcon className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open in VS Code</TooltipContent>
    </Tooltip>
  );
}

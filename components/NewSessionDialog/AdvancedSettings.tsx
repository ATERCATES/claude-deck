import { ChevronRight } from "lucide-react";
import { CLAUDE_AUTO_APPROVE_FLAG } from "@/lib/providers";

interface AdvancedSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  useTmux: boolean;
  onUseTmuxChange: (checked: boolean) => void;
  skipPermissions: boolean;
  onSkipPermissionsChange: (checked: boolean) => void;
}

export function AdvancedSettings({
  open,
  onOpenChange,
  useTmux,
  onUseTmuxChange,
  skipPermissions,
  onSkipPermissionsChange,
}: AdvancedSettingsProps) {
  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
        />
        Advanced Settings
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useTmux"
              checked={useTmux}
              onChange={(e) => onUseTmuxChange(e.target.checked)}
              className="border-border bg-background accent-primary h-4 w-4 rounded"
            />
            <label htmlFor="useTmux" className="cursor-pointer text-sm">
              Use tmux session
              <span className="text-muted-foreground ml-1">
                (enables detach/attach)
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="skipPermissions"
              checked={skipPermissions}
              onChange={(e) => onSkipPermissionsChange(e.target.checked)}
              className="border-border bg-background accent-primary h-4 w-4 rounded"
            />
            <label htmlFor="skipPermissions" className="cursor-pointer text-sm">
              Auto-approve tool calls
              <span className="text-muted-foreground ml-1">
                ({CLAUDE_AUTO_APPROVE_FLAG})
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

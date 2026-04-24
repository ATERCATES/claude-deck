"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  useWorktreeStatus,
  useDeleteWorktree,
  type ClaudeProject,
} from "@/data/claude";

interface DeleteWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: ClaudeProject;
}

export function DeleteWorktreeDialog({
  open,
  onOpenChange,
  worktree,
}: DeleteWorktreeDialogProps) {
  const { data: status, isPending } = useWorktreeStatus(
    open ? worktree.directory : null
  );
  const deleteMutation = useDeleteWorktree();
  const [deleteBranch, setDeleteBranch] = useState(true);

  const parentPath = worktree.parentRoot || worktree.directory || "";

  const handleDelete = () => {
    if (!worktree.directory) return;
    deleteMutation.mutate(
      {
        worktreePath: worktree.directory,
        projectPath: parentPath,
        deleteBranch,
      },
      {
        onSuccess: () => {
          toast.success("Worktree eliminado");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message || "No se pudo eliminar");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar worktree</DialogTitle>
          <DialogDescription>
            Esta acción borra la carpeta del worktree y puede borrar la rama
            local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Rama</div>
            <div className="font-mono">
              {status?.branchName || worktree.displayName}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Path</div>
            <div className="font-mono text-xs break-all">
              {worktree.directory}
            </div>
          </div>

          {isPending && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Comprobando estado…
            </div>
          )}

          {status?.dirty && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span>Tiene cambios sin commitear. Se perderán.</span>
            </div>
          )}

          {!!status?.activeSessions && status.activeSessions > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span>
                {status.activeSessions} sesión(es) de Claude apuntan a este
                worktree en las últimas 24h.
              </span>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={deleteBranch}
              onChange={(e) => setDeleteBranch(e.target.checked)}
              className="border-border bg-background accent-primary h-4 w-4 rounded"
            />
            Borrar también la rama local
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

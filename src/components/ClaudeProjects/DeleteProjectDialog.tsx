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
import { AlertTriangle } from "lucide-react";
import { useDeleteProject, type ClaudeProject } from "@/data/claude";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ClaudeProject;
  worktreeChildren: ClaudeProject[];
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  worktreeChildren,
}: DeleteProjectDialogProps) {
  const [includeWorktrees, setIncludeWorktrees] = useState(true);
  const deleteProject = useDeleteProject();

  const handleDelete = () => {
    deleteProject.mutate(
      {
        projectName: project.name,
        includeWorktrees: includeWorktrees && worktreeChildren.length > 0,
      },
      {
        onSuccess: () => {
          toast.success("Proyecto eliminado de Claude");
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
          <DialogTitle>Eliminar proyecto de Claude</DialogTitle>
          <DialogDescription>
            Se borrarán las sesiones JSONL de Claude Code para este proyecto. El
            código fuente en disco NO se toca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Proyecto</div>
            <div className="font-mono">{project.displayName}</div>
          </div>
          {project.directory && (
            <div>
              <div className="text-muted-foreground text-xs">Path</div>
              <div className="font-mono text-xs break-all">
                {project.directory}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <span>
              Esto borra el historial de sesiones Claude de{" "}
              <span className="font-mono">~/.claude/projects/</span>. El
              directorio del código no se elimina.
            </span>
          </div>

          {worktreeChildren.length > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeWorktrees}
                onChange={(e) => setIncludeWorktrees(e.target.checked)}
                className="border-border bg-background accent-primary mt-0.5 h-4 w-4 rounded"
              />
              <span>
                Eliminar también los {worktreeChildren.length} worktree(s) de
                este proyecto (carpetas en{" "}
                <span className="font-mono">~/.claude-deck/worktrees/</span>,
                ramas git y sus sesiones).
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteProject.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteProject.isPending}
          >
            {deleteProject.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

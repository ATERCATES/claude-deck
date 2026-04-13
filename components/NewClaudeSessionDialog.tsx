"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import type { ClaudeProject } from "@/data/claude";

const ADJECTIVES = [
  "swift",
  "bright",
  "calm",
  "bold",
  "keen",
  "vivid",
  "crisp",
  "warm",
  "cool",
  "sharp",
];
const NOUNS = [
  "falcon",
  "river",
  "prism",
  "cedar",
  "spark",
  "orbit",
  "ridge",
  "frost",
  "coral",
  "flint",
];

function generateName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

interface NewClaudeSessionDialogProps {
  open: boolean;
  projectName: string;
  projects?: ClaudeProject[];
  onClose: () => void;
  onConfirm: (name: string, cwd?: string, projectName?: string) => void;
}

export function NewClaudeSessionDialog({
  open,
  projectName,
  projects,
  onClose,
  onConfirm,
}: NewClaudeSessionDialogProps) {
  const [name, setName] = useState("");
  const [selectedProject, setSelectedProject] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(generateName());
      setSelectedProject(projectName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, projectName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const project = projects?.find((p) => p.name === selectedProject);
    onConfirm(
      name.trim() || generateName(),
      project?.directory || undefined,
      selectedProject || undefined
    );
  };

  const showProjectSelector = projects && projects.length > 0 && !projectName;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">New session</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {showProjectSelector ? (
            <div>
              <label className="text-muted-foreground mb-2 block text-xs">
                Project
              </label>
              <Select
                value={selectedProject}
                onValueChange={setSelectedProject}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects
                    .filter((p) => !p.hidden && p.sessionCount > 0)
                    .map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.displayName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            projectName && (
              <p className="text-muted-foreground text-xs">{projectName}</p>
            )
          )}
          <div>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Session name"
                className="h-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-9 w-9 shrink-0"
                onClick={() => setName(generateName())}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={showProjectSelector && !selectedProject}
            >
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

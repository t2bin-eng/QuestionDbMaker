import type { WorkspaceRole } from "@/types/domain";

export type WorkspaceAction = "read" | "edit" | "manage_members" | "delete";

const permissions: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  owner: new Set(["read", "edit", "manage_members", "delete"]),
  editor: new Set(["read", "edit"]),
  viewer: new Set(["read"]),
};

export function can(role: WorkspaceRole, action: WorkspaceAction) {
  return permissions[role].has(action);
}

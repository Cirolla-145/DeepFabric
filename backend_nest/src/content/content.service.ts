import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ContentService {
  constructor(private readonly db: DatabaseService) {}

  async ownsWorkspace(id: string, userId: string) {
    return (
      (
        await this.db.query(
          "SELECT id FROM workspaces WHERE id = ? AND user_id = ?",
          [id, userId],
        )
      ).length > 0
    );
  }
  async ownsSubject(id: string, userId: string) {
    return (
      (
        await this.db.query(
          "SELECT s.id FROM subjects s JOIN workspaces w ON w.id = s.workspace_id WHERE s.id = ? AND w.user_id = ?",
          [id, userId],
        )
      ).length > 0
    );
  }

  workspaces(userId: string) {
    return this.db.query(
      "SELECT id, name, description, tags, created_at, updated_at FROM workspaces WHERE user_id = ? ORDER BY updated_at DESC, name ASC",
      [userId],
    );
  }
  async subjects(workspaceId: string, userId: string) {
    if (!(await this.ownsWorkspace(workspaceId, userId)))
      throw new NotFoundException("Workspace not found");
    return this.db.query(
      "SELECT id, workspace_id, name, description, tags, created_at, updated_at FROM subjects WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC",
      [workspaceId],
    );
  }
  async modules(subjectId: string, userId: string) {
    if (!(await this.ownsSubject(subjectId, userId)))
      throw new NotFoundException("Subject not found");
    return this.db.query(
      "SELECT id, subject_id, name, description, tags, created_at, updated_at FROM modules WHERE subject_id = ? ORDER BY updated_at DESC, name ASC",
      [subjectId],
    );
  }
  async createWorkspace(userId: string, body: any) {
    if (!body.name?.trim())
      throw new ForbiddenException("Workspace name is required");
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO workspaces (id, user_id, name, description, tags) VALUES (?, ?, ?, ?, ?)",
      [
        id,
        userId,
        body.name,
        body.description ?? null,
        body.tags ? JSON.stringify(body.tags) : null,
      ],
    );
    return {
      message: "Workspace created successfully",
      workspace: { id, ...body },
    };
  }
  async createSubject(userId: string, body: any) {
    if (!body.workspace_id || !body.name?.trim())
      throw new ForbiddenException("workspace_id and name are required");
    if (!(await this.ownsWorkspace(body.workspace_id, userId)))
      throw new ForbiddenException("You do not have access to this workspace");
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO subjects (id, workspace_id, name, description, tags) VALUES (?, ?, ?, ?, ?)",
      [
        id,
        body.workspace_id,
        body.name,
        body.description ?? null,
        body.tags ? JSON.stringify(body.tags) : null,
      ],
    );
    return {
      message: "Subject created successfully",
      subject: { id, ...body },
    };
  }
  async createModule(userId: string, body: any) {
    if (!body.subject_id || !body.name?.trim())
      throw new ForbiddenException("subject_id and name are required");
    if (!(await this.ownsSubject(body.subject_id, userId)))
      throw new ForbiddenException("You do not have access to this subject");
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO modules (id, subject_id, name, description, tags) VALUES (?, ?, ?, ?, ?)",
      [
        id,
        body.subject_id,
        body.name,
        body.description ?? null,
        body.tags ? JSON.stringify(body.tags) : null,
      ],
    );
    return { message: "module created successfully", module: { id, ...body } };
  }
}

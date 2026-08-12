import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { ContentService } from "./content.service";

@UseGuards(AuthGuard)
@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}
  @Get("workspaces") async workspaces(@Req() req: any) {
    return { workspaces: await this.content.workspaces(req.user.id) };
  }
  @Get("workspaces/:workspaceId/subjects") async subjects(
    @Req() req: any,
    @Param("workspaceId") id: string,
  ) {
    return { subjects: await this.content.subjects(id, req.user.id) };
  }
  @Get("subjects/:subjectId/modules") async modules(
    @Req() req: any,
    @Param("subjectId") id: string,
  ) {
    return { modules: await this.content.modules(id, req.user.id) };
  }
  @Post("create-workspace") createWorkspace(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.content.createWorkspace(req.user.id, body);
  }
  @Post("create-subject") createSubject(@Req() req: any, @Body() body: any) {
    return this.content.createSubject(req.user.id, body);
  }
  @Post("create-module") createModule(@Req() req: any, @Body() body: any) {
    return this.content.createModule(req.user.id, body);
  }
}

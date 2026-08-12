import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { LearningService } from "./learning.service";

@UseGuards(AuthGuard)
@Controller("learning")
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get("home-insights") homeInsights(@Req() req: any) {
    return this.learning.homeInsights(req.user.id);
  }

  @Post("sources")
  createSource(@Req() req: any, @Body() body: any) {
    return this.learning.createSource(req.user.id, body);
  }
  @Post("source-versions")
  sourceVersion(@Req() req: any, @Body() body: any) {
    return this.learning.sourceVersion(req.user.id, body);
  }
  @Post("sources/:sourceId/process") process(
    @Req() req: any,
    @Param("sourceId") id: string,
  ) {
    return this.learning.processSource(req.user.id, id);
  }
  @Patch("concepts/:conceptId") reviewConcept(
    @Req() req: any,
    @Param("conceptId") id: string,
    @Body() body: any,
  ) {
    return this.learning.reviewConcept(req.user.id, id, body);
  }
  @Patch("concepts/:conceptId/merge") merge(
    @Req() req: any,
    @Param("conceptId") id: string,
    @Body("target_concept_id") target: string,
  ) {
    return this.learning.mergeConcepts(req.user.id, id, target);
  }
  @Post("modules/:moduleId/questions/regenerate") generate(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return this.learning.generateQuestions(req.user.id, id);
  }
  @Patch("questions/:questionId") reviewQuestion(
    @Req() req: any,
    @Param("questionId") id: string,
    @Body() body: any,
  ) {
    return this.learning.reviewQuestion(req.user.id, id, body);
  }
  @Post("study-sessions") start(@Req() req: any, @Body() body: any) {
    return this.learning.startSession(req.user.id, body);
  }
  @Patch("study-sessions/:sessionId/end") end(
    @Req() req: any,
    @Param("sessionId") id: string,
  ) {
    return this.learning.endSession(req.user.id, id);
  }
  @Post("attempts") attempt(@Req() req: any, @Body() body: any) {
    return this.learning.createAttempt(req.user.id, body);
  }
  @Patch("attempts/:attemptId/grade") grade(
    @Req() req: any,
    @Param("attemptId") id: string,
  ) {
    return this.learning.gradeAttempt(req.user.id, id);
  }
  @Patch("attempts/:attemptId/override") override(
    @Req() req: any,
    @Param("attemptId") id: string,
    @Body() body: any,
  ) {
    return this.learning.override(req.user.id, id, body);
  }
  @Get("modules/:moduleId/sources") async sources(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return { sources: await this.learning.sources(id, req.user.id) };
  }
  @Get("sources/:sourceId/versions") async sourceVersions(
    @Req() req: any,
    @Param("sourceId") id: string,
  ) {
    return { versions: await this.learning.sourceVersions(req.user.id, id) };
  }
  @Get("modules/:moduleId/concepts") async concepts(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return { concepts: await this.learning.concepts(id, req.user.id) };
  }
  @Get("concepts/:conceptId/versions") conceptVersions(
    @Req() req: any,
    @Param("conceptId") id: string,
  ) {
    return this.learning.conceptVersions(req.user.id, id);
  }
  @Get("modules/:moduleId/questions") async questions(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return { questions: await this.learning.questions(id, req.user.id) };
  }
  @Get("questions/:questionId/versions") questionVersions(
    @Req() req: any,
    @Param("questionId") id: string,
  ) {
    return this.learning.questionVersions(req.user.id, id);
  }
  @Get("modules/:moduleId/insights") insights(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return this.learning.insights(id, req.user.id);
  }
  @Get("modules/:moduleId/audit-logs") async audit(
    @Req() req: any,
    @Param("moduleId") id: string,
  ) {
    return { audit_logs: await this.learning.auditLogs(id, req.user.id) };
  }
}

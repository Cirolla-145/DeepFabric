import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { ContentModule } from "./content/content.module";
import { DatabaseModule } from "./database/database.module";
import { LearningModule } from "./learning/learning.module";

@Module({
  imports: [DatabaseModule, AuthModule, ContentModule, LearningModule],
})
export class AppModule {}

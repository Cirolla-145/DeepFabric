import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.jwt;
    if (!token)
      throw new UnauthorizedException("Unauthorized - No Token Provided");
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
      };
      const users = await this.db.query("SELECT * FROM users WHERE id = ?", [
        decoded.userId,
      ]);
      if (!users.length) throw new UnauthorizedException("User not found");
      request.user = users[0];
      return true;
    } catch {
      throw new UnauthorizedException("Unauthorized - Invalid Token");
    }
  }
}

import { BadRequestException, Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async signup(body: any) {
    const { username, email, password } = body;
    if (!username || !email || !password)
      throw new BadRequestException("All fields are required");
    if (
      (await this.db.query("SELECT id FROM users WHERE email = ?", [email]))
        .length
    ) {
      throw new BadRequestException("User already exists");
    }
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)",
      [id, username, email, await bcrypt.hash(password, 10)],
    );
    return {
      message: "User created successfully",
      user: { id, name: username, email },
    };
  }

  async login(body: any) {
    const { email, password } = body;
    const users = await this.db.query<any>(
      "SELECT * FROM users WHERE email = ?",
      [email],
    );
    if (!users.length) throw new BadRequestException("User not found");
    if (!(await bcrypt.compare(password, users[0].password)))
      throw new BadRequestException("Invalid password");
    return users[0];
  }
}

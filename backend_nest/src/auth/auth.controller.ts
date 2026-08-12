import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { Response } from "express";
import { AuthGuard } from "../common/auth.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup") async signup(@Body() body: any) {
    return this.auth.signup(body);
  }

  @Post("login")
  async login(
    @Body() body: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.login(body);
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "15d",
    });
    response.cookie("jwt", token, {
      maxAge: 15 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return {
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.cookie("jwt", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "strict",
    });
    return { message: "Logout successful" };
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: any) {
    return {
      user: {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
      },
    };
  }
}

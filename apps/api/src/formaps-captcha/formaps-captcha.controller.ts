import { All, Controller, Options, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  FormapsCaptchaHttpError,
  FormapsCaptchaService,
  QWEN_CAPTCHA_REQUEST_HEADER,
} from "./formaps-captcha.service.js";

@Controller("qwen-captcha")
export class FormapsCaptchaController {
  constructor(private readonly formapsCaptcha: FormapsCaptchaService) {}

  @Options()
  options(@Req() request: Request, @Res() response: Response) {
    const headers = this.formapsCaptcha.extensionCorsHeaders(request.headers.origin);
    if (!headers["Access-Control-Allow-Origin"]) {
      return response.status(403).type("text/plain").send("Forbidden\n");
    }

    applyHeaders(response, headers);
    return response.status(204).send();
  }

  @Post()
  async solve(@Req() request: Request, @Res() response: Response) {
    const headers = this.formapsCaptcha.extensionCorsHeaders(request.headers.origin);
    applyHeaders(response, headers);
    response.setHeader("Cache-Control", "no-store");

    if (request.header(QWEN_CAPTCHA_REQUEST_HEADER) !== "1") {
      return response.status(403).json({ ok: false, error: "Forbidden" });
    }

    try {
      const result = await this.formapsCaptcha.analyze(request.body);
      return response.status(200).json({ ok: true, result });
    } catch (error) {
      const statusCode = error instanceof FormapsCaptchaHttpError ? error.statusCode : 500;
      return response.status(statusCode).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof FormapsCaptchaHttpError ? error.details : undefined,
      });
    }
  }

  @All()
  methodNotAllowed(@Res() response: Response) {
    response.setHeader("Allow", "POST, OPTIONS");
    response.setHeader("Cache-Control", "no-store");
    return response.status(405).json({ ok: false, error: "Method not allowed" });
  }
}

function applyHeaders(response: Response, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
}

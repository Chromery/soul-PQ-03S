import { Module } from "@nestjs/common";
import { FormapsCaptchaController } from "./formaps-captcha.controller.js";
import { FormapsCaptchaService } from "./formaps-captcha.service.js";

@Module({
  controllers: [FormapsCaptchaController],
  providers: [FormapsCaptchaService],
})
export class FormapsCaptchaModule {}

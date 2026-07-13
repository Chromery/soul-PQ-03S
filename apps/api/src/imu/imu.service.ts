import { Injectable } from "@nestjs/common";
import { ImuCalculator } from "./imu-calculator.js";
import type { ImuCalculationInput } from "./imu.types.js";

@Injectable()
export class ImuService {
  private readonly calculator = new ImuCalculator();

  calculate(input: ImuCalculationInput) {
    return this.calculator.calculate(input);
  }
}

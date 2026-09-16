import type { Prisma } from "../generated/prisma/client.js";

type Override = Prisma.Decimal | number | null;
export type ImuOverrides = {
  imuRateOverride?: Override;
  imuMultiplierOverride?: Override;
  currentImuRateOverride?: Override;
  currentImuMultiplierOverride?: Override;
};

// Legacy fields now describe the forecast only. A null current override means
// system defaults, never the forecast's manual value.
export function imuOverrides(property: ImuOverrides, current = false) {
  const rate = current ? property.currentImuRateOverride : property.imuRateOverride;
  const multiplier = current ? property.currentImuMultiplierOverride : property.imuMultiplierOverride;
  return {
    rateOverridePercent: rate == null ? null : Number(rate),
    cadastralMultiplierOverride: multiplier == null ? null : Number(multiplier),
  };
}

CREATE TABLE "UserPreferences" (
    "clerkUserId" TEXT NOT NULL,
    "welcomeSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("clerkUserId")
);

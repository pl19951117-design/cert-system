import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Ensure Prisma engine + schema are copied into .next/standalone so the
  // bundled Electron app can run database queries without node_modules.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/**",
      "./node_modules/@prisma/client/**",
      "./prisma/schema.prisma",
    ],
  },
  // Never trace the build output back into the standalone bundle (caused a
  // ~870MB nested copy of release/), nor other build artifacts.
  outputFileTracingExcludes: {
    "*": ["release/**", "dist/**", "build/**"],
  },
};

export default nextConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // electron-builder 打包输出：内含 standalone 的整份源码副本，
    // 不应纳入 lint（否则同样的问题会被重复报告数千条）。
    "release/**",
    "dist/**",
  ]),
]);

export default eslintConfig;

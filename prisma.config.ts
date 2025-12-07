import { defineConfig } from "@prisma/internals";

export default defineConfig({
  seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
});

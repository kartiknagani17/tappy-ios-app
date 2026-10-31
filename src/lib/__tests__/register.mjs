// Lets `node --test` load the app's TypeScript modules, which use extensionless imports
// (Metro/bundler style). Run: npm run test:logic
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          try {
            return nextResolve(specifier + ext, context);
          } catch {
            // try next extension
          }
        }
      }
      throw err;
    }
  },
});

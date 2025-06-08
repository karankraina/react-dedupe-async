// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],           // Your main entry point for the hook
  format: ['cjs', 'esm'],            // Output CommonJS and ES Modules
  dts: true,                         // Generate .d.ts (type declaration) files
  clean: true,                       // Clean dist folder before building
  sourcemap: true,                   // Generate sourcemaps
  minify: false,                     // You can set to true for production if desired
  external: ['react', 'react-dom'],  // Mark react and react-dom as external to prevent bundling them
});
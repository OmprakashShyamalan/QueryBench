import { defineConfig } from "cypress";
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    testIsolation: false,
    setupNodeEvents(on, config) {
      // Load environment variables from cypress.env.json
      const envPath = path.resolve('cypress.env.json');
      if (fs.existsSync(envPath)) {
        const envVars = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
        config.env = { ...config.env, ...envVars };
      }
      return config;
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
  },
});

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', 
  transform: {
    '^.+\\.(ts|tsx)$': 'babel-jest', 
  },
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'], 
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy', 
  },
  testMatch: ['<rootDir>/src/**/*.test.(ts|tsx)'], 
};

export default config;
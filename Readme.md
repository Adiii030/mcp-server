# TypeScript Example Project

This repository contains a sample TypeScript project with separate `client` and `server` folders.

## Structure
- `client/` - Frontend code
- `server/` - Backend code

## Environment Files
- `.env`: Contains sensitive environment variables. **Do not commit this file to version control.**
- `.env.example`: Template for required environment variables. Copy this file to `.env` and fill in the values.

## Getting Started
1. Install dependencies:
   - Navigate to `client/` and `server/` folders and run `npm install`.
2. Set up environment variables:
   - Copy `.env.example` to `.env` in both `client` and `server` folders and update the values as needed.
3. Build and run:
   - Use `npm run build` and `npm start` as appropriate in each folder.

## Ignore Files
- `.env` is ignored by git (see `.gitignore`).
- Build artifacts and `node_modules` are also ignored.

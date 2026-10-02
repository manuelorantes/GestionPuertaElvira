# Code Style Capability

> This file is maintained by Aircury AI Framework. Do not edit it directly. Add project-specific rules in FRAMEWORK.local.md.

Automatically detects and follows project-specific linting and parsing rules by analysing package.json and config files.

## Framework Rules

## Code Style

### Linting and Parsing


Ensure code consistency by adhering to the project's configured tools.

- Analyse `package.json` to identify the linter and parser used (e.g., Biome, ESLint, Prettier, Oxlint).
- Check `devDependencies` and `dependencies` for tool-specific packages.
- Locate configuration files (`.eslintrc.*`, `prettier.config.js`, `biome.json`, `oxlint.json`).
- If a tool is detected, follow its specific rules and formatting conventions.
- If multiple tools are present (e.g., ESLint and Prettier), prioritise the one that handles the relevant concern (e.g., Prettier for formatting, ESLint for logic).
- If no tool is explicitly configured, default to industry standards for the project's language (e.g., StandardJS or AirBnB for JS/TS).

## Agent Operating Rules

- Always check `package.json` and local config files to determine the linting/parsing strategy before making code changes.
- Ensure all generated code passes the project's linting checks.

# Publishing Guide

This guide explains how to publish the Cozo Memory framework adapters to NPM.

## Prerequisites

1. **NPM Account**: Create an account at [npmjs.com](https://www.npmjs.com/)
2. **NPM Login**: Run `npm login` and authenticate
3. **Organization**: Create `@cozo-memory` organization on NPM (or use your own scope)
4. **Build**: Ensure all packages are built: `npm run build`
5. **Tests**: Verify all tests pass

## Publishing Order

Packages must be published in dependency order:

### 1. Core Package (First)

```bash
cd adapters/packages/core
npm run build
npm publish --access public
```

### 2. Framework Adapters (After Core)

```bash
# LangChain
cd adapters/packages/langchain
npm run build
npm publish --access public

# LlamaIndex
cd adapters/packages/llamaindex
npm run build
npm publish --access public
```

## Pre-Publishing Checklist

- [ ] All TypeScript compiles without errors
- [ ] All tests pass
- [ ] README files are up to date
- [ ] Version numbers are correct
- [ ] LICENSE file exists in each package
- [ ] Repository URLs are updated
- [ ] Keywords are relevant
- [ ] Examples work with built packages

## Version Management

We use semantic versioning (semver):

- **Patch** (0.1.0 → 0.1.1): Bug fixes
- **Minor** (0.1.0 → 0.2.0): New features, backward compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

Update versions in all package.json files:

```bash
# Update version in all packages
cd adapters/packages/core
npm version patch  # or minor, major

cd ../langchain
npm version patch

cd ../llamaindex
npm version patch
```

## Automated Publishing (Recommended)

Create a script to publish all packages:

```bash
#!/bin/bash
# publish-all.sh

set -e

echo "Building all packages..."
cd adapters
npm run build

echo "Publishing @cozo-memory/adapters-core..."
cd packages/core
npm publish --access public

echo "Publishing @cozo-memory/langchain..."
cd ../langchain
npm publish --access public

echo "Publishing @cozo-memory/llamaindex..."
cd ../llamaindex
npm publish --access public

echo "✅ All packages published successfully!"
```

Make it executable:
```bash
chmod +x publish-all.sh
./publish-all.sh
```

## Post-Publishing

1. **Verify Installation**: Test installing from NPM
   ```bash
   npm install @cozo-memory/langchain
   npm install @cozo-memory/llamaindex
   ```

2. **Update Documentation**: Update main README with NPM badges
   ```markdown
   [![npm version](https://badge.fury.io/js/%40cozo-memory%2Flangchain.svg)](https://www.npmjs.com/package/@cozo-memory/langchain)
   ```

3. **Create GitHub Release**: Tag the release
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0 - Framework Adapters"
   git push origin v0.1.0
   ```

4. **Announce**: Share on social media, forums, etc.

## Troubleshooting

### "Package name already exists"
- Choose a different scope or package name
- Or request access to the existing package

### "Authentication required"
- Run `npm login` again
- Check your NPM token is valid

### "Version already published"
- Increment version number
- Cannot republish same version

### "Missing files"
- Check `files` field in package.json
- Ensure `dist/` folder exists after build

## NPM Scripts Reference

```bash
# Build all packages
npm run build

# Clean build artifacts
npm run clean

# Test all packages
npm run test

# Publish with automatic build
npm run prepublishOnly  # Runs automatically before publish
```

## Security

- Never commit `.npmrc` with auth tokens
- Use `npm token create` for CI/CD
- Enable 2FA on your NPM account
- Review published files: `npm pack --dry-run`

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/cozo-memory/issues
- NPM Support: https://www.npmjs.com/support

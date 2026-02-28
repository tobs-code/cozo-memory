# Contributing to CozoDB Memory

Thanks for your interest in contributing to CozoDB Memory! This guide will help you get started.

## Code of Conduct

Be respectful, constructive, and professional. We're all here to build something useful.

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/tobs-code/cozo-memory.git
cd cozo-memory

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npx ts-node src/test-export-import.ts
```

### First Run

The first run downloads the embedding model (~500MB). This may take 30-90 seconds depending on your connection.

## Development Workflow

### Project Structure

```
src/
├── index.ts                    # MCP server entry point
├── memory-service.ts           # High-level memory operations
├── db-service.ts               # CozoDB abstraction layer
├── embedding-service.ts        # Embedding generation
├── hybrid-search.ts            # Search strategies
├── inference-engine.ts         # Inference engine
├── export-import-service.ts    # Export/import functionality
└── test-*.ts                   # Feature tests
```

### Coding Standards

- TypeScript strict mode enabled
- Use PascalCase for classes (`MemoryServer`)
- Use camelCase for methods (`createEntity`)
- Use UPPER_SNAKE_CASE for constants (`DB_PATH`)
- Use kebab-case for files (`hybrid-search.ts`)
- Database relations use snake_case (`entity_community`)

### Testing

```bash
# Run specific test
npx ts-node src/test-<feature>.ts

# Run benchmarks
npm run benchmark

# Build and test
npm run rebuild
```

No formal test framework is used. Tests are standalone TypeScript files in `src/test-*.ts`.

### Making Changes

1. **Fork the repository** on GitHub
2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following the coding standards
4. **Test your changes** thoroughly
5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: Add new feature X"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** on GitHub

### Commit Message Format

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Test additions or changes
- `chore:` Build process or tooling changes

Examples:
```
feat: Add semantic caching with L1/L2 layers
fix: Resolve CozoDB query syntax in helper methods
docs: Update README with export/import examples
```

## What to Contribute

### High-Priority Areas

- **Performance optimizations** for large datasets
- **Additional export/import formats** (e.g., Notion, Roam Research)
- **Graph algorithm improvements** (new algorithms, optimizations)
- **Documentation improvements** (examples, tutorials, use cases)
- **Bug fixes** with test cases

### Feature Ideas

Check `Low-Hanging-Fruit.md` for quick wins and feature ideas.

### Bug Reports

When reporting bugs, include:

- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs
- Minimal code example if possible

Use GitHub Issues with the `bug` label.

### Feature Requests

For feature requests, include:

- Use case description
- Expected behavior
- Why this would be useful
- Potential implementation approach (optional)

Use GitHub Issues with the `enhancement` label.

## Technical Guidelines

### Database Operations

- Always use parameterized queries to avoid SQL injection
- Use CozoDB Validity for time-travel support
- Wrap multi-step operations in transactions
- Add error handling with descriptive logging

Example:
```typescript
await this.dbService.run(`
  ?[id, name, type] <- [[$id, $name, $type]]
  :insert entity {id, name, type, created_at}
`, { id, name, type });
```

### Error Handling

- Use try-catch blocks for database operations
- Log errors with prefixes: `[Schema]`, `[DB]`, `[Export]`, etc.
- Provide graceful fallbacks where possible
- Validate inputs at service boundaries using Zod schemas

### Performance Considerations

- Use embedding cache (L1 + L2) for repeated queries
- Batch operations when possible
- Consider RocksDB backend for large datasets
- Profile with benchmarks before optimizing

### Documentation

- Add JSDoc comments for public APIs
- Update README.md for user-facing changes
- Update steering files in `.kiro/steering/` for architecture changes
- Include code examples in documentation

## Pull Request Process

1. **Ensure tests pass** and code builds successfully
2. **Update documentation** if needed
3. **Add test cases** for new features or bug fixes
4. **Keep PRs focused** - one feature or fix per PR
5. **Respond to feedback** promptly and constructively

### PR Checklist

- [ ] Code builds without errors (`npm run build`)
- [ ] Tests pass (`npx ts-node src/test-*.ts`)
- [ ] Documentation updated (README, JSDoc, etc.)
- [ ] Commit messages follow conventional format
- [ ] No unnecessary files committed (build artifacts, logs, etc.)
- [ ] Code follows project style guidelines

## Questions?

- Open a GitHub Issue for questions
- Check existing issues and PRs first
- Be specific and provide context

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

---

Thank you for contributing to CozoDB Memory! 🚀

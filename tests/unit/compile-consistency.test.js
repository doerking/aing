/**
 * compile.js consistency 字段测试（P1 #003）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('compile.js consistency 字段', () => {
  const tmpDir = path.join(__dirname, '..', 'tmp', 'compile-test-' + Date.now());
  const rawDir = path.join(tmpDir, 'raw');
  const wikiDir = path.join(tmpDir, 'wiki');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    fs.mkdirSync(rawDir, { recursive: true });
    fs.mkdirSync(path.join(wikiDir, 'entities'), { recursive: true });
    fs.mkdirSync(path.join(wikiDir, 'links'), { recursive: true });
    fs.mkdirSync(path.join(wikiDir, 'type-index'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('应该包含 consistency: 0.5 默认值', () => {
    const rawContent = `---
name: Test Entity
type: Concept
tags: [test]
---
# Test

This is a test document.
`;
    fs.writeFileSync(path.join(rawDir, 'test.md'), rawContent);

    execSync(`node "${path.join(__dirname, '..', '..', 'src', 'compile.js')}" --base-dir "${tmpDir}"`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const entityPath = path.join(wikiDir, 'entities', 'test.md');
    expect(fs.existsSync(entityPath)).toBe(true);
    
    const content = fs.readFileSync(entityPath, 'utf8');
    expect(content).toContain('consistency: 0.5');
  });

  test('应该保留自定义 consistency 值', () => {
    const rawContent = `---
name: Test Entity
type: Concept
consistency: 0.75
tags: [test]
---
# Test
`;
    fs.writeFileSync(path.join(rawDir, 'test.md'), rawContent);

    execSync(`node "${path.join(__dirname, '..', '..', 'src', 'compile.js')}" --base-dir "${tmpDir}"`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const entityPath = path.join(wikiDir, 'entities', 'test.md');
    const content = fs.readFileSync(entityPath, 'utf8');
    expect(content).toContain('consistency: 0.75');
  });

  test('database schema 应该包含 consistency 列', () => {
    const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('consistency REAL DEFAULT 0.5');
  });
});
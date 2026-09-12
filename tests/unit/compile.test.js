/**
 * compile.js 单元测试
 */
const fs = require('fs');
const path = require('path');

describe('compile.js', () => {
  test('should parse frontmatter', () => {
    const { parseFrontmatter } = require('../../src/compile.js');
    const content = `---
name: Test Entity
type: Concept
tags: [test, demo]
---

# Test Entity

Content here.
`;
    const result = parseFrontmatter(content);
    expect(result.metadata.name).toBe('Test Entity');
    expect(result.metadata.type).toBe('Concept');
    expect(result.metadata.tags).toEqual(['test', 'demo']);
  });
  
  test('should extract wikilinks', () => {
    const { extractLinks } = require('../../src/compile.js');
    const content = 'Check out [[Entity A]] and [[Entity B]] for more info.';
    const links = extractLinks(content);
    expect(links).toContain('Entity A');
    expect(links).toContain('Entity B');
  });
});

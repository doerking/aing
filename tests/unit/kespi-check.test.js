/**
 * kespi-check.js 单元测试
 */
describe('kespi-check.js', () => {
  test('should calculate KQ with consistency from links', () => {
    const KespiChecker = require('../../src/kespi-check.js');
    const checker = new KespiChecker();
    
    // Mock store
    checker.store = {
      getLinks: (entityId) => {
        if (entityId === 'entity-a') {
          return [
            { source_id: 'entity-a', target_id: 'entity-b' },
            { source_id: 'entity-a', target_id: 'entity-c' }
          ];
        }
        if (entityId === 'entity-b') {
          return [
            { source_id: 'entity-b', target_id: 'entity-a' }
          ];
        }
        return [];
      }
    };
    
    const entity = {
      id: 'entity-a',
      confidence: 0.8,
      updated_at: new Date().toISOString(),
      tags: '["test"]',
      source_file: 'test.md',
      content: 'Test content'.repeat(20),
      originality: 0.7,
      relevance: 0.7
    };
    
    const result = checker.calculateEntity(entity);
    expect(result).toBeDefined();
    expect(result.overall).toBeGreaterThan(0);
    expect(result.dimensions.KQ).toBeGreaterThan(0);
  });
});

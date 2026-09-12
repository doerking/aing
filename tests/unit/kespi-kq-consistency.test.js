/**
 * KQ 计算中 consistency 字段测试（P1 #003）
 */
describe('KQ consistency 字段', () => {
  let KespiChecker;
  
  beforeAll(() => {
    KespiChecker = require('../../src/kespi-check.js');
  });

  test('应该使用 entity.consistency 计算 KQ', () => {
    const checker = new KespiChecker();
    
    const entity = {
      id: 'test-entity',
      confidence: 0.8,
      consistency: 0.9,
      updated_at: new Date().toISOString(),
      tags: '["test"]',
      source_file: 'test.md',
      content: 'Test content'.repeat(50),
      originality: 0.7,
      relevance: 0.7
    };
    
    // Mock store methods
    checker.store = {
      all: jest.fn(() => []),
      get: jest.fn(() => null)
    };
    
    const result = checker.calculateEntity(entity);
    
    // KQ = confidence * 0.6 + consistency * 0.4 = 0.48 + 0.36 = 0.84
    expect(result.dimensions.KQ).toBeCloseTo(0.84, 2);
  });

  test('应该使用默认值 0.5 当 consistency 缺失时', () => {
    const checker = new KespiChecker();
    
    const entity = {
      id: 'test-entity',
      confidence: 0.8,
      updated_at: new Date().toISOString(),
      tags: '["test"]',
      source_file: 'test.md',
      content: 'Test content'.repeat(50)
    };
    
    checker.store = {
      all: jest.fn(() => []),
      get: jest.fn(() => null)
    };
    
    const result = checker.calculateEntity(entity);
    
    // KQ = 0.8 * 0.6 + 0.5 * 0.4 = 0.48 + 0.2 = 0.68
    expect(result.dimensions.KQ).toBeCloseTo(0.68, 2);
  });

  test('undefined consistency 应该得到相同结果', () => {
    const checker = new KespiChecker();
    
    const entity = {
      id: 'test-entity',
      confidence: 0.8,
      consistency: undefined,
      updated_at: new Date().toISOString(),
      tags: '["test"]',
      source_file: 'test.md',
      content: 'Test content'.repeat(50)
    };
    
    checker.store = {
      all: jest.fn(() => []),
      get: jest.fn(() => null)
    };
    
    const result = checker.calculateEntity(entity);
    
    expect(result.dimensions.KQ).toBeCloseTo(0.68, 2);
  });
});
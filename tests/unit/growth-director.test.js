/**
 * growth-director.js 单元测试
 */
const path = require('path');

describe('growth-director.js', () => {
  test('should initialize with metacognition', () => {
    const { GrowthDirector } = require('../../src/growth-director');
    const director = new GrowthDirector(path.join(__dirname, '..', 'knowledge.db'));
    
    expect(director).toBeDefined();
    expect(director.metacognition).toBeDefined();
  });
  
  test('should have perceive method', () => {
    const { GrowthDirector } = require('../../src/growth-director');
    const director = new GrowthDirector(path.join(__dirname, '..', 'knowledge.db'));
    
    expect(typeof director.perceive).toBe('function');
    expect(typeof director.decide).toBe('function');
  });
});

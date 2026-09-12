/**
 * consciousness-kernel.js 单元测试
 */
describe('consciousness-kernel.js', () => {
  test('should create kernel instance', () => {
    const { ConsciousnessKernel } = require('../../src/consciousness-kernel');
    const kernel = new ConsciousnessKernel({ baseDir: __dirname });
    
    expect(kernel).toBeDefined();
    expect(kernel.state).toBeDefined();
  });
  
  test('should ingest events', () => {
    const { ConsciousnessKernel } = require('../../src/consciousness-kernel');
    const kernel = new ConsciousnessKernel({ baseDir: __dirname });
    
    const result = kernel.ingest({
      source: 'test',
      channel: 'structure',
      signalType: 'observed',
      target: 'test-entity',
      intensity: 0.5,
      confidence: 0.8,
      suggestedAction: 'observe'
    });
    
    expect(result).toBeDefined();
    expect(result.accepted).toBeDefined();
  });
});

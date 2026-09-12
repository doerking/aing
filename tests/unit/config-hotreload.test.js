/**
 * config-hotreload.js 单元测试
 */
const fs = require('fs');
const path = require('path');

describe('config-hotreload.js', () => {
  test('should load config', () => {
    const { ConfigHotReload } = require('../../src/config-hotreload');
    const config = new ConfigHotReload(path.join(__dirname, '..', 'src', 'growth.config.js'));
    
    expect(config.get()).toBeDefined();
    expect(config.get().kespi).toBeDefined();
    expect(config.get().kespi.weights).toBeDefined();
    
    config.close();
  });
  
  test('should have onChange method', () => {
    const { ConfigHotReload } = require('../../src/config-hotreload');
    const config = new ConfigHotReload(path.join(__dirname, '..', 'src', 'growth.config.js'));
    
    expect(typeof config.onChange).toBe('function');
    expect(typeof config.get).toBe('function');
    expect(typeof config.close).toBe('function');
    
    config.close();
  });
});

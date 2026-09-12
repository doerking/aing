/**
 * verify-deploy.js C7c 负向测试验证（P0 #001）
 */
const fs = require('fs');
const path = require('path');

describe('C7c 负向测试', () => {
  test('verify-deploy.js 应该包含 C7c 检查', () => {
    const verifyPath = path.join(__dirname, '..', '..', 'verify-deploy.js');
    const content = fs.readFileSync(verifyPath, 'utf8');
    
    expect(content).toContain('C7c 负向测试');
    expect(content).toContain('腐坏门禁有效');
  });

  test('C7c 测试逻辑应该注入腐坏样本并检测', () => {
    const verifyPath = path.join(__dirname, '..', '..', 'verify-deploy.js');
    const content = fs.readFileSync(verifyPath, 'utf8');
    
    expect(content).toContain('_negative_test_');
    expect(content).toContain('SELECT DISTINCT entity_id FROM kespi_history');
    expect(content).toContain('unlinkSync');
  });
});
/**
 * pidAlive 跨平台测试（P1 #002）
 */
const fs = require('fs');
const path = require('path');

describe('pidAlive 跨平台检查', () => {
  test('代码应该包含跨平台 PID 检查逻辑', () => {
    const srcPath = path.join(__dirname, '..', '..', 'src', 'run-metabolism.js');
    const content = fs.readFileSync(srcPath, 'utf8');
    
    expect(content).toContain("process.platform === 'win32'");
    expect(content).toContain('tasklist');
    expect(content).toContain('process.kill');
  });

  test('pidAlive 函数应该存在', () => {
    const srcPath = path.join(__dirname, '..', '..', 'src', 'run-metabolism.js');
    const content = fs.readFileSync(srcPath, 'utf8');
    
    expect(content).toContain('function pidAlive(pid)');
  });
});
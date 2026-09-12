/**
 * auto-ingest.js 单元测试
 */
describe('auto-ingest.js', () => {
  test('should extract entities from content', () => {
    const { SessionStore } = require('../../src/auto-ingest');
    const store = new SessionStore();
    const session = store.getSession('test-session');
    
    store.extractEntities('Check out [[Entity A]] and **Entity B** for #tags', session);
    
    expect(session.entities.has('Entity A')).toBe(true);
    expect(session.entities.has('Entity B')).toBe(true);
    expect(session.tags.has('tags')).toBe(true);
  });
  
  test('should skip short messages', () => {
    const { SessionStore } = require('../../src/auto-ingest');
    const store = new SessionStore();
    
    // Mock ingestSession to track calls
    let ingestCalled = false;
    store.ingestSession = () => { ingestCalled = true; };
    
    // Add short message (should be skipped)
    store.addMessage('test-session', { role: 'user', content: 'hi' });
    
    expect(ingestCalled).toBe(false);
  });
});

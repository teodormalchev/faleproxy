const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  // Modify the app to use a test port
  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    // Allow both 127.0.0.1 and localhost connections for the test server
    nock.enableNetConnect('127.0.0.1');
    nock.enableNetConnect('localhost');
    
    // Create a temporary test app file
    await execAsync('cp app.js app.test.js');
    // Use sed syntax compatible with both Linux and macOS
    const sedCmd = process.platform === 'darwin' 
      ? `sed -i '' 's/const PORT = 3001/const PORT = ${TEST_PORT}/' app.test.js`
      : `sed -i 's/const PORT = 3001/const PORT = ${TEST_PORT}/' app.test.js`;
    await execAsync(sedCmd);
    
    // Start the test server
    server = require('child_process').spawn('node', ['app.test.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 10000); // Increase timeout for server startup

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      process.kill(-server.pid);
    }
    await execAsync('rm app.test.js');
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Note: The spawned server will make a real request to example.com
    // Since example.com doesn't contain "Yale", we'll use yale.edu instead
    
    // Make a request to our proxy app to fetch from yale.edu
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://www.yale.edu/'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify that the content was fetched and processed
    const $ = cheerio.load(response.data.content);
    
    // The title should have Yale replaced with Fale if it contained Yale
    const title = $('title').text();
    expect(title).not.toContain('Yale'); // Should be replaced
    
    // The content should exist
    expect(response.data.content).toBeTruthy();
    expect(response.data.content.length).toBeGreaterThan(0);
    
    // If there was any "Yale" in the original, it should be "Fale" now
    // (we can't check for specific Yale instances without knowing the exact page structure)
  }, 15000); // Increase timeout for real HTTP request

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});

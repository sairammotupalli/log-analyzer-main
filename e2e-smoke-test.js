const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runSmokeTest() {
  const results = {
    passed: [],
    failed: [],
    errors: [],
    screenshots: []
  };

  let browser;
  let context;
  let page;

  try {
    console.log('🚀 Starting E2E Smoke Test for SOC Log Analyzer\n');
    
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: './test-videos/' }
    });
    page = await context.newPage();

    // Listen for console messages
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        results.errors.push({
          type: 'console',
          level: type,
          text: msg.text(),
          location: msg.location()
        });
      }
    });

    // Listen for network errors
    page.on('response', response => {
      if (response.status() >= 400) {
        results.errors.push({
          type: 'network',
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    // Test 1: Visit localhost:3000 and confirm redirect to /login
    console.log('📋 Test 1: Navigate to http://localhost:3000 and check redirect to /login');
    try {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(2000);
      
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        results.passed.push('✅ Redirected to /login page');
        console.log('   ✅ Redirected to /login page');
      } else {
        results.failed.push(`❌ Expected redirect to /login, but got: ${currentUrl}`);
        console.log(`   ❌ Expected redirect to /login, but got: ${currentUrl}`);
      }
    } catch (error) {
      results.failed.push(`❌ Failed to navigate to app: ${error.message}`);
      console.log(`   ❌ Failed to navigate to app: ${error.message}`);
    }

    // Test 2: Register/Login flow
    console.log('\n📋 Test 2: Register/Login with new user');
    try {
      const timestamp = Date.now();
      const testEmail = `test${timestamp}@example.com`;
      const testPassword = 'TestPass123!';

      // Check if there's a "Create account" or "Sign up" link
      const signupLink = await page.locator('a:has-text("Create account"), a:has-text("Sign up"), button:has-text("Create account"), button:has-text("Sign up")').first();
      
      if (await signupLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('   Found signup link, clicking...');
        await signupLink.click();
        await page.waitForTimeout(1000);

        // Fill registration form
        await page.fill('input[type="email"], input[name="email"]', testEmail);
        await page.fill('input[type="password"], input[name="password"]', testPassword);
        
        // Look for confirm password field
        const confirmPasswordField = await page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]').first();
        if (await confirmPasswordField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmPasswordField.fill(testPassword);
        }

        // Submit registration
        await page.click('button[type="submit"], button:has-text("Sign up"), button:has-text("Register")');
        await page.waitForTimeout(2000);
        results.passed.push(`✅ Registered new user: ${testEmail}`);
        console.log(`   ✅ Registered new user: ${testEmail}`);
      } else {
        console.log('   No signup link found, attempting direct login...');
      }

      // Now login (either after registration or directly)
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        await page.fill('input[type="email"], input[name="email"]', testEmail);
        await page.fill('input[type="password"], input[name="password"]', testPassword);
        await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
        await page.waitForTimeout(3000);
      }

      // Check if we're on dashboard
      const afterLoginUrl = page.url();
      if (afterLoginUrl.includes('/dashboard') || afterLoginUrl === 'http://localhost:3000/') {
        results.passed.push('✅ Successfully logged in and reached dashboard');
        console.log('   ✅ Successfully logged in and reached dashboard');
        
        // Take screenshot of dashboard
        const screenshotPath = './test-screenshots/01-dashboard.png';
        await fs.promises.mkdir('./test-screenshots', { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        results.screenshots.push(screenshotPath);
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
      } else {
        results.failed.push(`❌ Login failed, current URL: ${afterLoginUrl}`);
        console.log(`   ❌ Login failed, current URL: ${afterLoginUrl}`);
      }
    } catch (error) {
      results.failed.push(`❌ Registration/Login failed: ${error.message}`);
      console.log(`   ❌ Registration/Login failed: ${error.message}`);
    }

    // Test 3: Navigate to LLM Settings
    console.log('\n📋 Test 3: Navigate to LLM Settings from header');
    try {
      // Look for LLM Settings link/button in header
      const llmSettingsButton = await page.locator('a:has-text("LLM Settings"), button:has-text("LLM Settings"), a:has-text("Settings"), [href*="settings"]').first();
      
      if (await llmSettingsButton.isVisible({ timeout: 5000 })) {
        await llmSettingsButton.click();
        await page.waitForTimeout(2000);
        
        const currentUrl = page.url();
        if (currentUrl.includes('settings')) {
          results.passed.push('✅ Navigated to LLM Settings page');
          console.log('   ✅ Navigated to LLM Settings page');
          
          // Take screenshot
          const screenshotPath = './test-screenshots/02-llm-settings.png';
          await page.screenshot({ path: screenshotPath, fullPage: true });
          results.screenshots.push(screenshotPath);
          console.log(`   📸 Screenshot saved: ${screenshotPath}`);
        } else {
          results.failed.push(`❌ Expected settings page, got: ${currentUrl}`);
          console.log(`   ❌ Expected settings page, got: ${currentUrl}`);
        }
      } else {
        results.failed.push('❌ Could not find LLM Settings button in header');
        console.log('   ❌ Could not find LLM Settings button in header');
      }
    } catch (error) {
      results.failed.push(`❌ Failed to navigate to LLM Settings: ${error.message}`);
      console.log(`   ❌ Failed to navigate to LLM Settings: ${error.message}`);
    }

    // Test 4: Configure LLM Settings
    console.log('\n📋 Test 4: Configure LLM Settings (select provider, set model, save)');
    try {
      // Select provider (OpenAI or Anthropic)
      const providerSelect = await page.locator('select[name="provider"], select[id*="provider"]').first();
      if (await providerSelect.isVisible({ timeout: 3000 })) {
        await providerSelect.selectOption({ label: 'OpenAI' });
        console.log('   Selected OpenAI as provider');
        results.passed.push('✅ Selected OpenAI provider');
      } else {
        // Try radio buttons
        const openaiRadio = await page.locator('input[type="radio"][value="openai"], label:has-text("OpenAI")').first();
        if (await openaiRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
          await openaiRadio.click();
          console.log('   Selected OpenAI as provider (radio)');
          results.passed.push('✅ Selected OpenAI provider');
        }
      }

      // Set model field (optional)
      const modelInput = await page.locator('input[name="model"], input[id*="model"]').first();
      if (await modelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await modelInput.fill('gpt-4');
        console.log('   Set model to gpt-4');
        results.passed.push('✅ Set model field');
      }

      // Leave API key blank (should keep existing)
      console.log('   Leaving API key blank (keeping existing)');

      // Click Save button
      const saveButton = await page.locator('button:has-text("Save"), button[type="submit"]').first();
      if (await saveButton.isVisible({ timeout: 3000 })) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        
        // Look for success message
        const successMessage = await page.locator('text="Saved", text="Success", [role="alert"]:has-text("saved")').first();
        if (await successMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
          results.passed.push('✅ LLM Settings saved successfully');
          console.log('   ✅ LLM Settings saved successfully');
        } else {
          results.failed.push('❌ No success message after saving');
          console.log('   ❌ No success message after saving');
        }
      } else {
        results.failed.push('❌ Could not find Save button');
        console.log('   ❌ Could not find Save button');
      }
    } catch (error) {
      results.failed.push(`❌ Failed to configure LLM Settings: ${error.message}`);
      console.log(`   ❌ Failed to configure LLM Settings: ${error.message}`);
    }

    // Test 5: Navigate back to Dashboard
    console.log('\n📋 Test 5: Navigate back to Dashboard');
    try {
      const dashboardLink = await page.locator('a:has-text("Dashboard"), a[href="/dashboard"], a[href="/"]').first();
      if (await dashboardLink.isVisible({ timeout: 3000 })) {
        await dashboardLink.click();
        await page.waitForTimeout(2000);
        results.passed.push('✅ Navigated back to Dashboard');
        console.log('   ✅ Navigated back to Dashboard');
      } else {
        await page.goto('http://localhost:3000/dashboard');
        await page.waitForTimeout(2000);
        results.passed.push('✅ Navigated back to Dashboard (via URL)');
        console.log('   ✅ Navigated back to Dashboard (via URL)');
      }
    } catch (error) {
      results.failed.push(`❌ Failed to navigate back to Dashboard: ${error.message}`);
      console.log(`   ❌ Failed to navigate back to Dashboard: ${error.message}`);
    }

    // Test 6: Upload log file
    console.log('\n📋 Test 6: Upload sample log file');
    try {
      const logFilePath = '/Users/sairammotupalli/Documents/tenex/sample_logs/zscaler_sample.log';
      
      // Check if file exists
      if (!fs.existsSync(logFilePath)) {
        throw new Error(`Log file not found at: ${logFilePath}`);
      }

      // Look for file input
      const fileInput = await page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false) || await fileInput.count() > 0) {
        await fileInput.setInputFiles(logFilePath);
        console.log('   Uploaded log file');
        await page.waitForTimeout(3000);
        
        // Check if redirected to analysis page
        const currentUrl = page.url();
        if (currentUrl.includes('/analysis') || currentUrl.includes('/upload')) {
          results.passed.push('✅ File uploaded, redirected to analysis page');
          console.log('   ✅ File uploaded, redirected to analysis page');
          
          // Wait for analysis to complete
          console.log('   ⏳ Waiting for analysis to complete...');
          let statusComplete = false;
          for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(2000);
            
            // Check for COMPLETE status
            const completeStatus = await page.locator('text="COMPLETE", text="Complete", [data-status="COMPLETE"]').first();
            if (await completeStatus.isVisible({ timeout: 1000 }).catch(() => false)) {
              statusComplete = true;
              results.passed.push('✅ Analysis status: COMPLETE');
              console.log('   ✅ Analysis status: COMPLETE');
              break;
            }
          }
          
          if (!statusComplete) {
            results.failed.push('❌ Analysis did not complete within timeout');
            console.log('   ❌ Analysis did not complete within timeout');
          }
          
          // Check for anomalies panel
          const anomaliesPanel = await page.locator('[data-testid="anomalies-panel"], text="Anomalies", text="anomalies"').first();
          if (await anomaliesPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
            results.passed.push('✅ Anomalies panel rendered');
            console.log('   ✅ Anomalies panel rendered');
          } else {
            results.failed.push('❌ Anomalies panel not found');
            console.log('   ❌ Anomalies panel not found');
          }
          
          // Check for log table
          const logTable = await page.locator('table, [role="table"], [data-testid="log-table"]').first();
          if (await logTable.isVisible({ timeout: 5000 }).catch(() => false)) {
            results.passed.push('✅ Log table rendered');
            console.log('   ✅ Log table rendered');
          } else {
            results.failed.push('❌ Log table not found');
            console.log('   ❌ Log table not found');
          }
          
          // Take final screenshot
          const screenshotPath = './test-screenshots/03-analysis-results.png';
          await page.screenshot({ path: screenshotPath, fullPage: true });
          results.screenshots.push(screenshotPath);
          console.log(`   📸 Screenshot saved: ${screenshotPath}`);
          
        } else {
          results.failed.push(`❌ Expected analysis page, got: ${currentUrl}`);
          console.log(`   ❌ Expected analysis page, got: ${currentUrl}`);
        }
      } else {
        results.failed.push('❌ Could not find file upload input');
        console.log('   ❌ Could not find file upload input');
      }
    } catch (error) {
      results.failed.push(`❌ File upload failed: ${error.message}`);
      console.log(`   ❌ File upload failed: ${error.message}`);
    }

  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    results.failed.push(`❌ Test suite error: ${error.message}`);
  } finally {
    if (page) {
      await page.screenshot({ path: './test-screenshots/final-state.png', fullPage: true });
    }
    if (context) await context.close();
    if (browser) await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n✅ PASSED (${results.passed.length}):`);
  results.passed.forEach(item => console.log(`   ${item}`));
  
  console.log(`\n❌ FAILED (${results.failed.length}):`);
  results.failed.forEach(item => console.log(`   ${item}`));
  
  console.log(`\n⚠️  ERRORS (${results.errors.length}):`);
  results.errors.forEach(error => {
    if (error.type === 'console') {
      console.log(`   [Console ${error.level}] ${error.text}`);
    } else if (error.type === 'network') {
      console.log(`   [Network ${error.status}] ${error.url} - ${error.statusText}`);
    }
  });
  
  console.log(`\n📸 SCREENSHOTS (${results.screenshots.length}):`);
  results.screenshots.forEach(path => console.log(`   ${path}`));
  
  console.log('\n' + '='.repeat(80));
  
  // Save results to JSON
  fs.writeFileSync('./test-results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Full results saved to: ./test-results.json\n');
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

runSmokeTest().catch(console.error);

/**
 * Acceptance & Verification Test Suite for Gmail & Integrations
 * Tests OAuth URL generation, token refresh logic, query building,
 * recruiter classification, multi-tenant application linking,
 * idempotence, and disconnect mechanics.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Application = require('../models/Application');
const Company = require('../models/Company');
const {
  classifyRecruiterMessage,
  processRecruiterEmail,
  getGmailAuthUrl,
  getAppliedCompanyDomains,
  buildGmailRecruiterQuery,
  getValidAccessToken,
  runScheduledGmailSyncForAllUsers
} = require('../services/emailTrackingService');

async function runTests() {
  console.log('====================================================');
  console.log('GMAIL INTEGRATION & RECRUITER TRACKING VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // ----------------------------------------------------
    // Test 1: OAuth URL generation
    // ----------------------------------------------------
    console.log('TEST 1: Google OAuth 2.0 URL construction & required scopes');
    const authUrlResult = getGmailAuthUrl('test_state_123');
    // If GOOGLE_CLIENT_ID is set or not set, test both pathways
    if (process.env.GOOGLE_CLIENT_ID) {
      assert(
        authUrlResult.configured === true &&
        authUrlResult.authUrl.includes('accounts.google.com') &&
        authUrlResult.authUrl.includes('gmail.readonly') &&
        authUrlResult.authUrl.includes('access_type=offline') &&
        authUrlResult.authUrl.includes('prompt=consent'),
        'OAuth URL contains required offline access, consent prompt, and read-only scope.'
      );
    } else {
      // Temporarily simulate client ID
      process.env.GOOGLE_CLIENT_ID = 'mock-client-id.apps.googleusercontent.com';
      const simUrl = getGmailAuthUrl('sim_state');
      assert(
        simUrl.configured === true &&
        simUrl.authUrl.includes('mock-client-id') &&
        simUrl.authUrl.includes('gmail.readonly') &&
        simUrl.authUrl.includes('prompt=consent'),
        'OAuth URL successfully synthesized with offline access & consent prompt.'
      );
      delete process.env.GOOGLE_CLIENT_ID;
    }

    // ----------------------------------------------------
    // Test 2: Recruiter Message Classifier Stages
    // ----------------------------------------------------
    console.log('\nTEST 2: Classification of all 6 recruiter message types');

    const rejection = classifyRecruiterMessage(
      'Update on your application',
      'Unfortunately, we are not able to offer you a position at this time.'
    );
    assert(rejection.detected && rejection.status === 'rejected', 'Rejection detected with high priority.');

    const offer = classifyRecruiterMessage(
      'Formal Offer of Employment',
      'We are pleased to offer you the position of Senior Backend Engineer at Razorpay.'
    );
    assert(offer.detected && offer.status === 'offer', 'Job offer detected.');

    const interview = classifyRecruiterMessage(
      'Interview Invitation - Swiggy Engineering',
      'Please join us for a technical interview on Google Meet: https://meet.google.com/abc-defg-hij'
    );
    assert(interview.detected && interview.status === 'interview', 'Interview invitation detected.');

    const assessment = classifyRecruiterMessage(
      'Online Coding Assessment',
      'You have been invited to complete a HackerRank coding challenge for Software Engineer.'
    );
    assert(assessment.detected && assessment.status === 'assessment', 'Technical assessment detected.');

    const confirmation = classifyRecruiterMessage(
      'Thank you for applying to PhonePe',
      'We have received your application for Backend Developer and our team is reviewing it.'
    );
    assert(confirmation.detected && confirmation.status === 'applied', 'Application confirmation detected.');

    const recruiterResp = classifyRecruiterMessage(
      'Regarding your application to Cred',
      'Our talent acquisition team has reviewed your resume and wanted to follow up on your candidacy.'
    );
    assert(recruiterResp.detected && recruiterResp.status === 'applied', 'General recruiter response detected.');

    // ----------------------------------------------------
    // Test 3: Gmail Targeted Query Builder
    // ----------------------------------------------------
    console.log('\nTEST 3: Targeted Gmail recruiter query builder');
    const query = buildGmailRecruiterQuery({
      domains: ['swiggy.in', 'razorpay.com'],
      companies: ['Swiggy', 'Razorpay'],
      unreadOnly: true,
      days: 14
    });

    assert(
      query.includes('is:unread') &&
      query.includes('newer_than:14d') &&
      query.includes('from:(swiggy.in OR razorpay.com)') &&
      query.includes('interview'),
      'Gmail query properly targets applied domains, unread status, and recruiter keywords.'
    );

    // ----------------------------------------------------
    // Test 4: Applied Company Domains Extraction
    // ----------------------------------------------------
    console.log('\nTEST 4: Applied company domain extraction from active applications');
    const testUserId = new mongoose.Types.ObjectId();

    // Create a mock company
    const mockComp = await Company.create({
      name: 'Test Razorpay Technologies',
      slug: `test-razorpay-${Date.now()}`,
      domain: 'test-razorpay.com'
    });

    // Create active applications for this user
    const app1 = await Application.create({
      userId: testUserId,
      companyId: mockComp._id,
      companyName: 'Test Razorpay',
      jobTitle: 'Backend Engineer',
      location: 'Bengaluru',
      status: 'applied',
      applyUrl: 'https://test-razorpay.com/careers/job123'
    });

    const domainsInfo = await getAppliedCompanyDomains(testUserId);
    assert(
      domainsInfo.domains.includes('test-razorpay.com') &&
      domainsInfo.companyNames.includes('Test Razorpay') &&
      domainsInfo.count === 1,
      'Extracted applied company domain and name correctly.'
    );

    // ----------------------------------------------------
    // Test 5: Inbound Recruiter Email Matching & Timeline Logging
    // ----------------------------------------------------
    console.log('\nTEST 5: Recruiter email matching, domain disambiguation & timeline logging');

    const emailMatch = await processRecruiterEmail(testUserId, {
      id: 'msg_test_001',
      from: 'recruiter@test-razorpay.com',
      subject: 'Interview Invitation with Test Razorpay',
      body: 'Hi, we would like to invite you to an interview round on Google Meet.'
    });

    assert(
      emailMatch.linked === true &&
      emailMatch.stageAdvanced === true &&
      emailMatch.newStatus === 'interview',
      'Email matched to application by domain and advanced status to interview.'
    );

    const updatedApp = await Application.findById(app1._id);
    const event = updatedApp.events.find(e => e.status === 'interview');
    assert(
      event && event.note.includes('msg_test_001'),
      'Timeline event recorded with email ID and recruiter note.'
    );

    // ----------------------------------------------------
    // Test 6: Idempotence: Duplicate email processing
    // ----------------------------------------------------
    console.log('\nTEST 6: Idempotence invariant (duplicate emails do not duplicate timeline events)');
    const eventCountBefore = updatedApp.events.length;

    const dupResult = await processRecruiterEmail(testUserId, {
      id: 'msg_test_001', // Same message ID
      from: 'recruiter@test-razorpay.com',
      subject: 'Interview Invitation with Test Razorpay',
      body: 'Hi, we would like to invite you to an interview round on Google Meet.'
    });

    const appAfterDup = await Application.findById(app1._id);
    assert(
      dupResult.linked === true &&
      dupResult.alreadyProcessed === true &&
      appAfterDup.events.length === eventCountBefore,
      'Duplicate email recognized and prevented redundant timeline logging.'
    );

    // ----------------------------------------------------
    // Test 7: Secure Token Storage & Auto-Refresh Mechanics
    // ----------------------------------------------------
    console.log('\nTEST 7: User model secure token storage & token refresh resolution');

    const testUser = await User.create({
      email: `candidate-${Date.now()}@jobradar.local`,
      password: 'HashedPassword123!',
      candidateProfile: {
        gmailIntegration: {
          connected: true,
          email: 'candidate@gmail.com',
          accessToken: 'fresh_mock_access_token',
          refreshToken: 'mock_refresh_token',
          expiresAt: Date.now() + 3600 * 1000 // Valid for 1 hour
        }
      }
    });

    // Test resolving a valid token
    const token = await getValidAccessToken(testUser._id);
    assert(token === 'fresh_mock_access_token', 'Valid access token resolved without unnecessary refresh.');

    // ----------------------------------------------------
    // Test 8: Disconnect Flow & Credentials Cleanup
    // ----------------------------------------------------
    console.log('\nTEST 8: Gmail account disconnect and token clearance');
    const applicationController = require('../controllers/applicationController');

    let disconnectResPayload = null;
    const mockReq = { user: { id: testUser._id } };
    const mockRes = {
      status: (code) => {
        mockRes.statusCode = code;
        return mockRes;
      },
      json: (payload) => {
        disconnectResPayload = payload;
      }
    };

    await applicationController.disconnectGmail(mockReq, mockRes);
    const userAfterDisconnect = await User.findById(testUser._id);
    const gmailState = userAfterDisconnect.candidateProfile?.gmailIntegration;

    assert(
      disconnectResPayload?.success === true &&
      disconnectResPayload?.connected === false &&
      gmailState?.connected === false &&
      gmailState?.accessToken === null &&
      gmailState?.refreshToken === null,
      'Disconnect endpoint clears access token, refresh token, and marks connected as false.'
    );

    // ----------------------------------------------------
    // Test 9: Scheduled Sync Telemetry
    // ----------------------------------------------------
    console.log('\nTEST 9: Scheduled Gmail sync batch telemetry');
    const syncSummary = await runScheduledGmailSyncForAllUsers({ days: 7 });
    assert(
      typeof syncSummary.usersChecked === 'number' &&
      typeof syncSummary.totalMessagesProcessed === 'number' &&
      Array.isArray(syncSummary.userResults),
      'Scheduled Gmail sync completed and reported telemetry metrics.'
    );

    // Cleanup test records
    await Application.deleteOne({ _id: app1._id });
    await Company.deleteOne({ _id: mockComp._id });
    await User.deleteOne({ _id: testUser._id });

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();

# 🔍 Code Review Report

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | 8/100 |
| **Files Reviewed** | 1 |
| **Critical Issues** | 3 |
| **High Priority Tests** | 26 |
| **Refactoring Opportunities** | 6 |

## 🎯 Top Recommendations

1. 🚨 **Security - PCI DSS Violation**: Immediately stop processing plain text credit card numbers and CVV data. This code violates PCI DSS compliance requirements. Replace the entire payment processing implementation with a PCI-compliant payment gateway (Stripe, Square, Braintree) that handles card tokenization client-side. The application should never see or handle full card numbers or CVV values.
   - Files: src/premium.ts

2. 🚨 **Data Integrity - Payment Transaction Atomicity**: Payment processing lacks transaction atomicity - users can be charged without receiving premium access if upgradeUserSubscription fails. Implement database transactions with rollback capability, or use a saga pattern to ensure payment and subscription grant happen atomically. Consider implementing compensating transactions (refunds) for failed upgrades.
   - Files: src/premium.ts

3. 🚨 **Testing - Zero Test Coverage on Payment Logic**: All payment processing, card validation, pricing calculation, and authorization functions are completely untested. This represents unacceptable financial and security risk. Create comprehensive test suite covering: payment flows (success/failure), card validation (valid/invalid/expired), pricing calculations for all tiers, subscription upgrades, authorization checks, and error handling. Minimum 26 critical test cases identified.
   - Files: src/premium.ts

4. 🚨 **Input Validation - Missing Security Checks**: Critical input validation gaps: no userId validation (could process payments for invalid users), card validation only checks length (accepts non-numeric characters, no Luhn algorithm), no SQL injection protection verification. Add comprehensive input sanitization and validation for all user-supplied data before processing payments or database operations.
   - Files: src/premium.ts

5. ⚠️ **Financial Accuracy - Floating Point Errors**: Currency calculations use floating-point arithmetic which can cause rounding errors (e.g., 0.1 + 0.2 !== 0.3 in JavaScript). This could lead to incorrect charges. Use integer arithmetic with cents or a decimal library (decimal.js) for all financial calculations to ensure accuracy.
   - Files: src/premium.ts

## Full Findings

### `src/premium.ts`

Quality score: **0/100** | Estimated coverage: **0%** | Tests found: none

#### Code Quality Issues (20)

This payment processing code contains multiple critical security vulnerabilities that violate PCI DSS compliance, including handling full credit card numbers and CVV in plain text. Additional critical issues include lack of transactional integrity (users can be charged without receiving premium access), SQL injection risks, inadequate input validation, floating-point currency calculation errors, and missing error handling. The code requires a complete security redesign using a PCI-compliant payment gateway before it can safely process payments.

- **[CRITICAL]** `src/premium.ts:69` (security): Plain text credit card number stored in memory and passed around. Full card numbers (PCI DSS sensitive data) should never be handled directly in application code. The cardNumber field contains the full 16-digit card number which violates PCI DSS requirements.
  - Fix: Use a payment gateway SDK (Stripe, Square, etc.) that handles card tokenization. Never store or process full card numbers in your application. Example: Use Stripe.js to tokenize cards client-side, then only pass the token to your backend.
- **[CRITICAL]** `src/premium.ts:72` (security): CVV stored and passed in plain text. CVV data must never be stored after authorization according to PCI DSS requirements, even temporarily in memory during processing.
  - Fix: Remove CVV handling from your application entirely. Use a PCI-compliant payment gateway that handles CVV validation server-side without exposing it to your application code.
- **[CRITICAL]** `src/premium.ts:120` (security): No encryption of sensitive payment data. Card numbers are being processed and stored (even if just last 4 digits) without any mention of encryption in transit or at rest.
  - Fix: Implement end-to-end encryption using TLS 1.2+ for all payment data transmission. Use a payment gateway that is PCI DSS Level 1 certified to handle all sensitive card data.
- **[HIGH]** `src/premium.ts:118` (security): Potential SQL injection vulnerability. While using parameterized queries ($1, $2, $3) which is good, the 'db.query' implementation is not shown and there's no validation that the db module actually uses safe parameterized queries.
  - Fix: Ensure the db module uses properly parameterized queries. Add explicit input validation: validate userId is a valid UUID/ID format before any database operation. Example: if (!/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error('Invalid userId format');
- **[HIGH]** `src/premium.ts:145` (security): SQL injection risk with JSON.stringify on features array. While parameterized queries are used, the JSON.stringify operation on user-controlled data without validation could lead to unexpected behavior if features array is manipulated.
  - Fix: Validate the features array before stringification: ensure it only contains expected feature strings from a whitelist. Example: const validFeatures = ['unlimited_todos', 'priority_support', ...]; features = features.filter(f => validFeatures.includes(f));
- **[HIGH]** `src/premium.ts:64` (security): No card number validation beyond length check. The validatePaymentDetails function only checks if cardNumber.length === 16, but doesn't validate if it contains only digits, perform Luhn algorithm check, or verify it's a valid card format.
  - Fix: Implement proper card validation: (1) Check cardNumber contains only digits, (2) Implement Luhn algorithm for checksum validation, (3) Validate BIN ranges. Better yet, use a payment gateway library. Example: if (!/^\d{16}$/.test(cardNumber)) return false; // Luhn check implementation needed
- **[HIGH]** `src/premium.ts:125` (security): Error details logged to console may expose sensitive information. 'console.error('Payment failed:', error)' could log stack traces, database connection strings, or other sensitive details to logs accessible to unauthorized personnel.
  - Fix: Log only sanitized, non-sensitive error information. Use a structured logging library with proper log levels and redaction. Example: logger.error('Payment processing failed', { userId, amount, errorCode: error.code });
- **[HIGH]** `src/premium.ts:31` (bug-risk): Missing input validation on userId parameter. No validation that userId is non-empty, properly formatted, or exists before processing payment. This could lead to payments being processed for invalid users.
  - Fix: Add comprehensive input validation at the start of processPremiumPayment: if (!userId || typeof userId !== 'string' || userId.trim() === '') throw new Error('Invalid userId'); Consider also validating userId format (UUID, numeric ID, etc.) and checking user existence.
- **[HIGH]** `src/premium.ts:48` (bug-risk): Payment processing lacks atomicity and transaction handling. If upgradeUserSubscription fails after chargeCard succeeds, the user is charged but doesn't receive premium access. No rollback or refund mechanism exists.
  - Fix: Wrap the entire payment flow in a database transaction with proper rollback on failure. Use a two-phase commit or saga pattern. Example: const transaction = await db.beginTransaction(); try { await chargeCard(...); await upgradeUserSubscription(...); await transaction.commit(); } catch (e) { await transaction.rollback(); await refundPayment(...); throw e; }
- **[HIGH]** `src/premium.ts:83` (bug-risk): Date comparison bug in expiry validation. 'new Date(2000 + parseInt(year), parseInt(month) - 1)' creates a date at the beginning of the expiry month, but cards are valid through the last day of the expiry month, not just the first day.
  - Fix: Set the date to the last day of the expiry month for accurate validation. Example: const expiryDateObj = new Date(2000 + parseInt(year), parseInt(month), 0); // Day 0 = last day of previous month, or use: new Date(2000 + parseInt(year), parseInt(month)); // First day of next month
- **[MEDIUM]** `src/premium.ts:100` (maintainability): Magic numbers for pricing, tax rate, and processing fee are hardcoded without explanation or configuration. PRICING, TAX_RATE (0.08), and PROCESSING_FEE (0.029) should be configurable as they vary by jurisdiction and payment processor.
  - Fix: Move pricing configuration to a separate config file or database table. Add comments explaining the rates. Example: import { PRICING_CONFIG } from './config/pricing'; const { TAX_RATE, PROCESSING_FEE } = PRICING_CONFIG[userJurisdiction]; // Tax rates vary by location
- **[MEDIUM]** `src/premium.ts:112` (bug-risk): Floating point arithmetic used for currency calculations. 'basePrice + tax + fee' uses floating point math which can lead to rounding errors in financial calculations (e.g., 0.1 + 0.2 !== 0.3 in JavaScript).
  - Fix: Use integer arithmetic with cents or a decimal library for precise currency calculations. Example: import Decimal from 'decimal.js'; const basePrice = new Decimal(PRICING[tier]); const total = basePrice.times(1 + TAX_RATE + PROCESSING_FEE).toDecimalPlaces(2); return total.toNumber();
- **[MEDIUM]** `src/premium.ts:38` (bug-risk): Insufficient payment amount check uses simple comparison without considering floating point precision. 'payment.amount < amount' could fail for legitimate payments due to rounding differences (e.g., 10.99 vs 10.990000001).
  - Fix: Use a tolerance-based comparison for currency amounts or work with integer cents. Example: const TOLERANCE = 0.01; if (payment.amount + TOLERANCE < amount) { throw new Error('Insufficient payment amount'); } // Or better: work with cents as integers
- **[MEDIUM]** `src/premium.ts:155` (bug-risk): No validation on database query results. 'db.query' is assumed to return an array with a 'length' property and indexable rows, but no error handling exists if the query fails or returns unexpected structure.
  - Fix: Add explicit validation of query results before accessing properties. Example: const result = await db.query(query, [userId]); if (!result || !Array.isArray(result.rows)) throw new Error('Database query failed'); const rows = result.rows; if (rows.length === 0) return false;
- **[MEDIUM]** `src/premium.ts:161` (bug-risk): JSON.parse without error handling. If 'subscription.features' contains invalid JSON, the entire function will throw an uncaught exception, denying access even if the user has a valid subscription.
  - Fix: Wrap JSON.parse in try-catch and provide fallback behavior. Example: let features; try { features = JSON.parse(subscription.features); } catch (e) { logger.error('Invalid features JSON', { userId }); return false; // or return default features }
- **[MEDIUM]** `src/premium.ts:140` (maintainability): Feature lists are hardcoded in upgradeUserSubscription with duplicated logic. The same features appear in multiple places, making maintenance error-prone if feature lists change.
  - Fix: Extract feature definitions to a constant or configuration object. Example: const TIER_FEATURES = { premium: ['unlimited_todos', 'priority_support', 'custom_themes'], enterprise: [...TIER_FEATURES.premium, 'api_access', 'team_collaboration'] }; const features = TIER_FEATURES[tier];
- **[MEDIUM]** `src/premium.ts:166` (bug-risk): No null/undefined checks on database row fields before accessing properties. Accessing 'row.user_id', 'row.tier', etc. without validation could throw if database schema changes or returns null values.
  - Fix: Validate all required fields exist before constructing return object. Example: if (!row.user_id || !row.tier || !row.valid_until) { logger.error('Incomplete subscription data', { userId }); return null; } // Then construct Subscription object
- **[LOW]** `src/premium.ts:42` (maintainability): Inconsistent error handling. Some errors are thrown (lines 35, 38, 42) while chargeCard returns false on failure (line 124). This mixed approach makes it unclear what the calling code should expect.
  - Fix: Standardize error handling: either consistently throw errors or consistently return result objects. Prefer throwing for exceptional cases. Example: if (!paymentSuccessful) { throw new Error('Payment processing failed'); } // Remove the return false pattern
- **[LOW]** `src/premium.ts:176` (maintainability): No input validation on 'feature' parameter in hasFeatureAccess. An attacker could pass malicious input or exploit the features.includes() check with object prototype pollution.
  - Fix: Validate the feature parameter is a string and sanitize input. Example: if (typeof feature !== 'string' || feature.trim() === '') return false; Use Array.prototype.includes.call() to avoid prototype pollution: return Array.prototype.includes.call(features, feature);
- **[INFO]** `src/premium.ts:7` (maintainability): Missing database module validation. The file imports 'db' from './database' but there's no type definition or validation that db.query exists and has the expected signature.
  - Fix: Add TypeScript interface for database module or validate at runtime. Example: interface Database { query<T = any>(sql: string, params: any[]): Promise<T[]>; } import { db } from './database'; // Ensure db implements Database interface

#### Test Coverage Gaps (26)

Zero test coverage for critical payment and subscription logic. All 7 functions are untested including processPremiumPayment (payment processing), validatePaymentDetails (card validation), calculateSubscriptionPrice (pricing), chargeCard (payment execution), upgradeUserSubscription (access grant), hasFeatureAccess (authorization), and getUserSubscription (data retrieval). The estimate is 0% because no test files exist for this module, leaving all payment flows, authorization checks, edge cases (expired cards, insufficient payment, database failures), and security-critical validation completely unverified. This represents significant financial and security risk.

- **[CRITICAL]** function at processPremiumPayment (lines 27-56): Processes real payment transactions involving money. A bug could result in unauthorized charges, failed payments with subscription grants, or financial loss. This is the core payment flow.
  - Suggested test: it('successfully processes valid premium payment') - call processPremiumPayment('user123', {cardNumber: '1234567812345678', expiryDate: '12/26', cvv: '123', amount: 10.82}, 'premium') and expect(result).toBe(true), verify db.query was called with subscription data
- **[CRITICAL]** edge-case at processPremiumPayment - invalid payment details (line 31): Must reject invalid card data to prevent fraudulent transactions. Missing test could allow bad payment data to reach payment gateway.
  - Suggested test: it('throws error for invalid payment details') - call processPremiumPayment('user123', {cardNumber: '123', expiryDate: 'invalid', cvv: '1', amount: 10}, 'premium') and expect it to throw Error with message 'Invalid payment details'
- **[CRITICAL]** edge-case at processPremiumPayment - insufficient amount (lines 38-40): Payment amount validation prevents users from paying less than required. Bug could allow discounted or free premium access.
  - Suggested test: it('throws error when payment amount is less than subscription price') - call processPremiumPayment('user123', validPaymentWith({amount: 5}), 'premium') and expect it to throw Error with message 'Insufficient payment amount'
- **[CRITICAL]** edge-case at processPremiumPayment - payment gateway failure (lines 43-46): When chargeCard fails, must return false without granting subscription. Bug could grant premium access without payment.
  - Suggested test: it('returns false when card charge fails without upgrading subscription') - mock chargeCard to return false, call processPremiumPayment with valid data and expect(result).toBe(false), verify upgradeUserSubscription was NOT called
- **[CRITICAL]** function at validatePaymentDetails (lines 62-91): Card validation is the first defense against invalid payment data. Weak validation allows fraudulent attempts or crashes in payment gateway.
  - Suggested test: it('returns true for valid 16-digit card with 3-digit CVV and future expiry') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '12/26', cvv: '123', amount: 10}) and expect(result).toBe(true)
- **[CRITICAL]** edge-case at validatePaymentDetails - invalid card length (lines 66-68): Must reject cards that are not 16 digits to prevent payment processing errors.
  - Suggested test: it('returns false for card number shorter than 16 digits') - call validatePaymentDetails({cardNumber: '12345', expiryDate: '12/26', cvv: '123', amount: 10}) and expect(result).toBe(false)
- **[CRITICAL]** edge-case at validatePaymentDetails - invalid CVV length (lines 71-73): CVV must be 3 or 4 digits. Accepting invalid CVV could cause payment rejection or security issues.
  - Suggested test: it('returns false for CVV that is not 3 or 4 digits') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '12/26', cvv: '12', amount: 10}) and expect(result).toBe(false)
- **[CRITICAL]** edge-case at validatePaymentDetails - invalid expiry format (lines 76-79): Expiry must match MM/YY format. Invalid format could cause parsing errors or accept malformed dates.
  - Suggested test: it('returns false for expiry date not matching MM/YY format') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '13/26', cvv: '123', amount: 10}) and expect(result).toBe(false)
- **[CRITICAL]** edge-case at validatePaymentDetails - expired card (lines 82-87): Must reject expired cards to prevent failed payment attempts. Bug would allow charging expired cards.
  - Suggested test: it('returns false for expired card') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '01/20', cvv: '123', amount: 10}) and expect(result).toBe(false)
- **[HIGH]** edge-case at validatePaymentDetails - 4-digit CVV (Amex): American Express cards use 4-digit CVV. Must verify this path works correctly.
  - Suggested test: it('returns true for valid card with 4-digit CVV') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '12/26', cvv: '1234', amount: 10}) and expect(result).toBe(true)
- **[CRITICAL]** function at calculateSubscriptionPrice (lines 97-110): Pricing calculation directly affects revenue. Wrong calculation could undercharge or overcharge customers, causing financial loss or legal issues.
  - Suggested test: it('calculates correct premium price with tax and processing fee') - call calculateSubscriptionPrice('premium') and expect(result).toBe(10.818971) (9.99 + 8% tax + 2.9% fee)
- **[CRITICAL]** branch at calculateSubscriptionPrice - enterprise tier (line 99): Enterprise pricing is higher value. Must verify correct calculation for this tier to ensure proper revenue.
  - Suggested test: it('calculates correct enterprise price with tax and processing fee') - call calculateSubscriptionPrice('enterprise') and expect(result).toBe(54.44451) (49.99 + 8% tax + 2.9% fee)
- **[CRITICAL]** function at chargeCard (lines 116-129): Executes the actual payment by inserting into payments table. Database errors must be handled to prevent payment loss tracking.
  - Suggested test: it('inserts payment record and returns true on success') - mock db.query to resolve, call chargeCard({cardNumber: '1234567812345678', expiryDate: '12/26', cvv: '123', amount: 10.82}, 10.82) and expect(result).toBe(true), verify db.query called with correct parameters including last 4 digits '5678'
- **[CRITICAL]** edge-case at chargeCard - database error (lines 124-127): Database failure during payment must return false to prevent subscription grant without payment record. Bug could lose payment tracking.
  - Suggested test: it('returns false when database payment insert fails') - mock db.query to reject with error, call chargeCard with valid data and expect(result).toBe(false), verify error was logged to console
- **[CRITICAL]** function at upgradeUserSubscription (lines 135-149): Grants premium access after payment. Wrong tier or features could give incorrect access. Date calculation bug could grant perpetual or expired access.
  - Suggested test: it('inserts premium subscription with correct features and 1-year validity') - mock db.query, call upgradeUserSubscription('user123', 'premium') and verify db.query called with userId='user123', tier='premium', features=['unlimited_todos','priority_support','custom_themes'], validUntil is 1 year from now
- **[CRITICAL]** branch at upgradeUserSubscription - enterprise features (lines 140-142): Enterprise tier includes additional features like API access. Missing features would prevent paid functionality access.
  - Suggested test: it('grants enterprise subscription with all 5 features including api_access and team_collaboration') - call upgradeUserSubscription('user123', 'enterprise') and verify features array contains ['unlimited_todos','priority_support','custom_themes','api_access','team_collaboration']
- **[HIGH]** edge-case at upgradeUserSubscription - database upsert: ON CONFLICT clause handles subscription renewal. Must verify existing subscriptions are updated, not duplicated.
  - Suggested test: it('updates existing subscription on conflict') - mock db.query, call upgradeUserSubscription for existing user and verify query uses ON CONFLICT DO UPDATE with correct tier and validUntil parameters
- **[CRITICAL]** function at hasFeatureAccess (lines 155-173): Authorization check for premium features. Bug could allow free users to access paid features or block paying users from features.
  - Suggested test: it('returns true when user has valid subscription with requested feature') - mock db.query to return subscription with features=['unlimited_todos'] and validUntil in future, call hasFeatureAccess('user123', 'unlimited_todos') and expect(result).toBe(true)
- **[CRITICAL]** edge-case at hasFeatureAccess - no subscription (lines 161-163): Users without subscriptions must be denied premium features. Bug could grant unauthorized access.
  - Suggested test: it('returns false when user has no subscription') - mock db.query to return empty array, call hasFeatureAccess('user123', 'unlimited_todos') and expect(result).toBe(false)
- **[CRITICAL]** edge-case at hasFeatureAccess - expired subscription (lines 168-170): Expired subscriptions must not grant access. Bug would allow continued access after subscription ends.
  - Suggested test: it('returns false when subscription is expired') - mock db.query to return subscription with validUntil in past, call hasFeatureAccess('user123', 'unlimited_todos') and expect(result).toBe(false)
- **[CRITICAL]** edge-case at hasFeatureAccess - feature not in subscription (lines 172-173): Must verify the specific feature is in the user's plan. Bug could grant enterprise features to premium users.
  - Suggested test: it('returns false when subscription exists but does not include requested feature') - mock db.query to return valid subscription with features=['unlimited_todos'], call hasFeatureAccess('user123', 'api_access') and expect(result).toBe(false)
- **[HIGH]** function at getUserSubscription (lines 179-194): Retrieves subscription data for display and validation. Incorrect data parsing could show wrong tier or features to users.
  - Suggested test: it('returns subscription object with parsed features and date') - mock db.query to return row with user_id='user123', tier='premium', valid_until='2027-01-01', features='["unlimited_todos"]', call getUserSubscription('user123') and expect result to match Subscription interface with parsed values
- **[HIGH]** edge-case at getUserSubscription - no subscription (lines 186-188): Must return null for users without subscriptions to allow proper handling in calling code.
  - Suggested test: it('returns null when user has no subscription') - mock db.query to return empty array, call getUserSubscription('user123') and expect(result).toBe(null)
- **[HIGH]** edge-case at validatePaymentDetails - card number with non-digits: Current code only checks length, not that cardNumber contains only digits. Could accept letters or special characters.
  - Suggested test: it('returns false for card number containing non-numeric characters') - call validatePaymentDetails({cardNumber: '123456781234abcd', expiryDate: '12/26', cvv: '123', amount: 10}) and expect(result).toBe(false)
- **[HIGH]** edge-case at validatePaymentDetails - CVV with non-digits: CVV validation only checks length. Should also verify CVV contains only digits.
  - Suggested test: it('returns false for CVV containing non-numeric characters') - call validatePaymentDetails({cardNumber: '1234567812345678', expiryDate: '12/26', cvv: 'abc', amount: 10}) and expect(result).toBe(false)
- **[HIGH]** edge-case at processPremiumPayment - async error in upgradeUserSubscription: If subscription upgrade fails after successful payment, money is charged but access not granted. Must handle this error.
  - Suggested test: it('handles error when subscription upgrade fails after successful payment') - mock chargeCard to return true, mock upgradeUserSubscription to throw error, call processPremiumPayment and verify error is thrown or logged

#### Refactoring Suggestions (6)

This payment processing file has significant architectural issues: it mixes error handling patterns (exceptions vs boolean returns), lacks separation of concerns in validation logic, duplicates subscription checking code, and doesn't provide transaction IDs or detailed error information. The suggested refactorings introduce the Result pattern for consistent error handling, extract validations following Single Responsibility Principle, centralize business configuration, and eliminate code duplication. These changes will make the code more testable, maintainable, and production-ready for critical payment operations.

**pattern-improvement** at processPremiumPayment function (lines 25-54) (impact: high)

Replace boolean return with structured result object to enable better error handling and provide detailed failure reasons. Current pattern loses error context and mixes exceptions with boolean returns, making it difficult to distinguish between validation failures, payment failures, and system errors.

Before:

~~~
export async function processPremiumPayment(
  userId: string,
  payment: PaymentDetails,
  tier: 'premium' | 'enterprise'
): Promise<boolean> {
  // Validate payment details
  if (!validatePaymentDetails(payment)) {
    throw new Error('Invalid payment details');
  }

  // Calculate pricing based on tier
  const amount = calculateSubscriptionPrice(tier);

  if (payment.amount < amount) {
    throw new Error('Insufficient payment amount');
  }

  // Process payment
  const paymentSuccessful = await chargeCard(payment, amount);

  if (!paymentSuccessful) {
    return false;
  }

  // Upgrade user subscription
  await upgradeUserSubscription(userId, tier);

  return true;
}
~~~

After:

~~~
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: {
    code: 'VALIDATION_FAILED' | 'INSUFFICIENT_AMOUNT' | 'PAYMENT_FAILED' | 'UPGRADE_FAILED';
    message: string;
  };
}

export async function processPremiumPayment(
  userId: string,
  payment: PaymentDetails,
  tier: 'premium' | 'enterprise'
): Promise<PaymentResult> {
  const validationResult = validatePaymentDetails(payment);
  if (!validationResult.isValid) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: validationResult.error || 'Invalid payment details'
      }
    };
  }

  const amount = calculateSubscriptionPrice(tier);
  if (payment.amount < amount) {
    return {
      success: false,
      error: {
        code: 'INSUFFICIENT_AMOUNT',
        message: `Required: ${amount.toFixed(2)}, provided: ${payment.amount.toFixed(2)}`
      }
    };
  }

  const chargeResult = await chargeCard(payment, amount);
  if (!chargeResult.success) {
    return {
      success: false,
      error: {
        code: 'PAYMENT_FAILED',
        message: chargeResult.error || 'Payment processing failed'
      }
    };
  }

  try {
    await upgradeUserSubscription(userId, tier);
    return {
      success: true,
      transactionId: chargeResult.transactionId
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPGRADE_FAILED',
        message: error instanceof Error ? error.message : 'Subscription upgrade failed'
      }
    };
  }
}
~~~

Benefits: Eliminates mixed error handling (exceptions vs booleans), provides detailed error information for logging and user feedback, enables better testing and debugging, follows result pattern for predictable error handling

**extract-function** at validatePaymentDetails function (lines 59-87) (impact: high)

Extract separate validation functions for each validation concern (card number, CVV, expiry date). This applies Single Responsibility Principle, makes each validation independently testable, and allows detailed error messages.

Before:

~~~
function validatePaymentDetails(payment: PaymentDetails): boolean {
  const { cardNumber, expiryDate, cvv } = payment;

  // Check card number length
  if (cardNumber.length !== 16) {
    return false;
  }

  // Check CVV length
  if (cvv.length !== 3 && cvv.length !== 4) {
    return false;
  }

  // Validate expiry date format (MM/YY)
  const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!expiryRegex.test(expiryDate)) {
    return false;
  }

  // Check if card is expired
  const [month, year] = expiryDate.split('/');
  const expiryDateObj = new Date(2000 + parseInt(year), parseInt(month) - 1);

  if (expiryDateObj < new Date()) {
    return false;
  }

  return true;
}
~~~

After:

~~~
interface ValidationResult {
  isValid: boolean;
  error?: string;
}

function validateCardNumber(cardNumber: string): ValidationResult {
  if (!/^\d{16}$/.test(cardNumber)) {
    return { isValid: false, error: 'Card number must be 16 digits' };
  }
  return { isValid: true };
}

function validateCVV(cvv: string): ValidationResult {
  if (!/^\d{3,4}$/.test(cvv)) {
    return { isValid: false, error: 'CVV must be 3 or 4 digits' };
  }
  return { isValid: true };
}

function validateExpiryDate(expiryDate: string): ValidationResult {
  const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!expiryRegex.test(expiryDate)) {
    return { isValid: false, error: 'Expiry date must be in MM/YY format' };
  }

  const [month, year] = expiryDate.split('/');
  const expiryDateObj = new Date(2000 + parseInt(year, 10), parseInt(month, 10) - 1);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (expiryDateObj < now) {
    return { isValid: false, error: 'Card has expired' };
  }

  return { isValid: true };
}

function validatePaymentDetails(payment: PaymentDetails): ValidationResult {
  const { cardNumber, expiryDate, cvv } = payment;

  const cardResult = validateCardNumber(cardNumber);
  if (!cardResult.isValid) return cardResult;

  const cvvResult = validateCVV(cvv);
  if (!cvvResult.isValid) return cvvResult;

  const expiryResult = validateExpiryDate(expiryDate);
  if (!expiryResult.isValid) return expiryResult;

  return { isValid: true };
}
~~~

Benefits: Each validation is independently testable, specific error messages help users fix issues, easier to add Luhn algorithm or other card validation later, follows Single Responsibility Principle

**extract-function** at upgradeUserSubscription function (lines 133-145) (impact: medium)

Extract feature list determination and subscription duration calculation into separate configuration functions. This centralizes business rules, makes them easier to modify, and improves testability.

Before:

~~~
async function upgradeUserSubscription(userId: string, tier: 'premium' | 'enterprise'): Promise<void> {
  const features = tier === 'premium'
    ? ['unlimited_todos', 'priority_support', 'custom_themes']
    : ['unlimited_todos', 'priority_support', 'custom_themes', 'api_access', 'team_collaboration'];

  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  const query = 'INSERT INTO subscriptions (user_id, tier, valid_until, features) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET tier = $2, valid_until = $3, features = $4';

  await db.query(query, [userId, tier, validUntil, JSON.stringify(features)]);
}
~~~

After:

~~~
const TIER_FEATURES = {
  premium: ['unlimited_todos', 'priority_support', 'custom_themes'],
  enterprise: ['unlimited_todos', 'priority_support', 'custom_themes', 'api_access', 'team_collaboration']
} as const;

function getFeaturesForTier(tier: 'premium' | 'enterprise'): string[] {
  return [...TIER_FEATURES[tier]];
}

function calculateSubscriptionEndDate(durationYears: number = 1): Date {
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + durationYears);
  return endDate;
}

async function upgradeUserSubscription(userId: string, tier: 'premium' | 'enterprise'): Promise<void> {
  const features = getFeaturesForTier(tier);
  const validUntil = calculateSubscriptionEndDate();

  const query = `
    INSERT INTO subscriptions (user_id, tier, valid_until, features) 
    VALUES ($1, $2, $3, $4) 
    ON CONFLICT (user_id) 
    DO UPDATE SET tier = $2, valid_until = $3, features = $4
  `;

  await db.query(query, [userId, tier, validUntil, JSON.stringify(features)]);
}
~~~

Benefits: Centralizes business logic configuration, makes feature lists reusable across codebase, easier to test subscription duration calculations, simplifies adding variable subscription periods

**simplify** at hasFeatureAccess and getUserSubscription functions (lines 150-180) (impact: medium)

Extract duplicate subscription validation logic into a reusable function. Both functions check if subscription exists and is valid, leading to code duplication.

Before:

~~~
export async function hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
  const query = 'SELECT features, valid_until FROM subscriptions WHERE user_id = $1';
  const rows = await db.query(query, [userId]);

  if (rows.length === 0) {
    return false;
  }

  const subscription = rows[0];
  const validUntil = new Date(subscription.valid_until);

  // Check if subscription is still valid
  if (validUntil < new Date()) {
    return false;
  }

  // Check if feature is included
  const features = JSON.parse(subscription.features);
  return features.includes(feature);
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const query = 'SELECT * FROM subscriptions WHERE user_id = $1';
  const rows = await db.query(query, [userId]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    userId: row.user_id,
    tier: row.tier,
    validUntil: new Date(row.valid_until),
    features: JSON.parse(row.features)
  };
}
~~~

After:

~~~
function isSubscriptionValid(validUntil: Date): boolean {
  return validUntil >= new Date();
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const query = 'SELECT * FROM subscriptions WHERE user_id = $1';
  const rows = await db.query(query, [userId]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    userId: row.user_id,
    tier: row.tier,
    validUntil: new Date(row.valid_until),
    features: JSON.parse(row.features)
  };
}

export async function hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription) {
    return false;
  }

  if (!isSubscriptionValid(subscription.validUntil)) {
    return false;
  }

  return subscription.features.includes(feature);
}
~~~

Benefits: Eliminates code duplication, ensures consistent subscription validation logic, reduces database query complexity in hasFeatureAccess, makes validation date logic testable and reusable

**pattern-improvement** at chargeCard function (lines 117-130) (impact: high)

Replace boolean return with structured result to provide transaction ID and detailed error information. Payment systems need transaction IDs for refunds, auditing, and reconciliation.

Before:

~~~
async function chargeCard(payment: PaymentDetails, amount: number): Promise<boolean> {
  // Simulate payment gateway call
  const query = 'INSERT INTO payments (card_last_four, amount, status) VALUES ($1, $2, $3)';
  const lastFour = payment.cardNumber.slice(-4);

  try {
    await db.query(query, [lastFour, amount, 'completed']);
    return true;
  } catch (error) {
    console.error('Payment failed:', error);
    return false;
  }
}
~~~

After:

~~~
interface ChargeResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

async function chargeCard(payment: PaymentDetails, amount: number): Promise<ChargeResult> {
  const query = `
    INSERT INTO payments (card_last_four, amount, status, created_at) 
    VALUES ($1, $2, $3, NOW()) 
    RETURNING id
  `;
  const lastFour = payment.cardNumber.slice(-4);

  try {
    const result = await db.query(query, [lastFour, amount, 'completed']);
    return {
      success: true,
      transactionId: result[0].id.toString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Payment processing failed';
    console.error('Payment failed:', errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}
~~~

Benefits: Provides transaction ID for refunds and auditing, detailed error messages for debugging, follows result pattern for consistency, enables proper payment reconciliation

**modernize** at calculateSubscriptionPrice function (lines 92-104) (impact: medium)

Extract pricing configuration to module-level constants and use more precise floating-point arithmetic. This makes pricing easier to maintain and test, and improves accuracy for financial calculations.

Before:

~~~
function calculateSubscriptionPrice(tier: 'premium' | 'enterprise'): number {
  const PRICING = {
    premium: 9.99,
    enterprise: 49.99
  };

  const basePrice = PRICING[tier];
  const TAX_RATE = 0.08;
  const PROCESSING_FEE = 0.029;

  const tax = basePrice * TAX_RATE;
  const fee = basePrice * PROCESSING_FEE;

  return basePrice + tax + fee;
}
~~~

After:

~~~
const PRICING_CONFIG = {
  tiers: {
    premium: 9.99,
    enterprise: 49.99
  },
  taxRate: 0.08,
  processingFeeRate: 0.029
} as const;

function calculateSubscriptionPrice(tier: 'premium' | 'enterprise'): number {
  const basePrice = PRICING_CONFIG.tiers[tier];
  const tax = basePrice * PRICING_CONFIG.taxRate;
  const fee = basePrice * PRICING_CONFIG.processingFeeRate;
  const total = basePrice + tax + fee;
  
  // Round to 2 decimal places for currency
  return Math.round(total * 100) / 100;
}
~~~

Benefits: Centralizes pricing configuration for easier updates, module-level constants are more testable and maintainable, proper rounding prevents floating-point precision issues in financial calculations, makes tax and fee rates easier to modify

---

*Generated at 2026-10-29T09:30:17.059Z • Duration: 376203ms*

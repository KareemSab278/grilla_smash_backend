const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { buildCheckoutRequest } = require('../payments');

test('buildCheckoutRequest normalizes currency and amount', () => {
  const request = buildCheckoutRequest({
    amount: '10.50',
    currency: 'gbp',
    description: 'Grilla Smash payment',
  });

  assert.equal(request.charge.amount, 1050);
  assert.equal(request.charge.currency, 'GBP');
  assert.equal(request.charge.description, 'Grilla Smash payment');
});

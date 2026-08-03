import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import generateTokenAndSetCookie from '../utils/generateToken.js';

test('JWT helper signs a token with the configured secret and writes an HTTP-only cookie', () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-secret';
    const calls = [];
    const response = { cookie: (...args) => calls.push(args) };

    generateTokenAndSetCookie('user-123', response);

    assert.equal(calls.length, 1);
    const [name, token, options] = calls[0];
    assert.equal(name, 'jwt');
    assert.equal(jwt.verify(token, 'test-secret').userId, 'user-123');
    assert.equal(options.httpOnly, true);

    if (originalSecret) process.env.JWT_SECRET = originalSecret;
    else delete process.env.JWT_SECRET;
});

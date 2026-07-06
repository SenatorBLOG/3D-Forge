import test from 'node:test'
import assert from 'node:assert/strict'

// pin a small limit BEFORE importing the module (it reads env per call)
process.env.IMAGE_DAILY_LIMIT = '3'
const { isImageGenMock, enforceImageDailyLimit } = await import('../src/services/imageGen.js')

// no GEMINI_API_KEY in tests → mock mode, no network calls ever

test('without a key the generator reports mock mode', () => {
  assert.equal(isImageGenMock(), true)
})

test('the daily limit trips after IMAGE_DAILY_LIMIT calls', () => {
  enforceImageDailyLimit()
  enforceImageDailyLimit()
  enforceImageDailyLimit()
  assert.throws(
    () => enforceImageDailyLimit(),
    (err) => err.code === 'DAILY_LIMIT' && err.status === 429,
  )
})

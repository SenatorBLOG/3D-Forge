import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generationCost,
  priceList,
  TIER_COSTS,
  REFINE_COST,
} from '../src/services/costs.js'

test('mock mode is always free regardless of tier or kind', () => {
  assert.equal(generationCost({ kind: 'preview', aiModel: 'meshy-6', mock: true }), 0)
  assert.equal(generationCost({ kind: 'refine', aiModel: 'meshy-5', mock: true }), 0)
})

test('preview costs by tier (m6 pricier than m5)', () => {
  assert.equal(generationCost({ kind: 'preview', aiModel: 'meshy-5' }), TIER_COSTS['meshy-5'])
  assert.equal(generationCost({ kind: 'preview', aiModel: 'meshy-6' }), TIER_COSTS['meshy-6'])
  assert.ok(TIER_COSTS['meshy-6'] > TIER_COSTS['meshy-5'])
})

test('refine has a flat cost', () => {
  assert.equal(generationCost({ kind: 'refine', aiModel: 'meshy-6' }), REFINE_COST)
})

test('an unknown tier falls back to the cheapest', () => {
  assert.equal(generationCost({ kind: 'preview', aiModel: 'meshy-99' }), TIER_COSTS['meshy-5'])
  assert.equal(generationCost({}), TIER_COSTS['meshy-5'])
})

test('priceList exposes the tiers and refine cost', () => {
  const p = priceList()
  assert.deepEqual(p.tiers, TIER_COSTS)
  assert.equal(p.refine, REFINE_COST)
})

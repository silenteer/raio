import { test, expect } from 'vitest'
import {merge} from './utils'

test('basic merge', () => {
  const source = {}
  const target = { hello: 'a' }
  expect(merge(source, target)).toStrictEqual({ hello: 'a' })
})

test('merge with array', () => {
  const source = { list: ['a']}
  const target = { list: ['b']}
  expect(merge(source, target)).toStrictEqual({ list: ['a', 'b']})
})

test('merge with off struct', () => {
  const source = { arr: []}
  const target = { arr: 'a' }
  expect(merge(source, target)).toStrictEqual({ arr: ['a']})
})

test('merge with set', () => {
  const a = new Set()
  const source = { s: new Set([1, 2])}
  const target = { s: new Set([1, 3])}
  merge(source, target)
  expect(Array.from(source.s.keys())).toStrictEqual([1,2,3])
})

test('merge with map', () => {
  const source = { s: new Map(Object.entries({ a: 1}))}
  const target = { s: new Map(Object.entries({ a: 2, b: 2}))}
  merge(source, target)

  expect(Object.fromEntries(source.s.entries())).toStrictEqual({
    a: 2,
    b: 2
  })
})

test('replace on unmergable', () => {
  const source = { a: 'a'}
  const target = { a: []}
  expect(merge(source, target)).toStrictEqual({ a: []})
})

test('deep merge', () => {
  const source = { map: { a: 'b' }}
  const target = { map: { b: 'c' }}
  expect(merge(source, target)).toStrictEqual({ map: { a: 'b', b: 'c'}})
})

test('overwrite', () => {
  const source = { map: { a: 'b' }}
  const target = { map: { a: 'c' }}
  expect(merge(source, target)).toStrictEqual({ map: { a: 'c' }})
})

test('source is mutated', () => {
  const source = { map: { a: 'b' }}
  const target = { map: { a: 'c' }}
  expect(merge(source, target)).toStrictEqual({ map: { a: 'c' }})
  expect(source).toStrictEqual({ map: { a: 'c' }})
})

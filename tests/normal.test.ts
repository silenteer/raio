import { expect, describe, it, test } from "vitest"
import { execaCommand } from "execa"
import chalk from "chalk"

describe("basic cli should work", async () => {
  test.each([
    { command: `-e hello`, opts: {cwd: './suites/basic' }, result: {"headers":{},"body":"world","code":200}},
    { command: `-e error`, opts: {cwd: './suites/basic' }, result: {"headers":{},"body":{},"code":500 }},
    { command: `-e hello --cwd ./suites/basic`, result: {"headers":{},"body":"world","code":200}},
    { command: `-e plus --cwd ./suites/basic -d ./math -b ${JSON.stringify({ left: 1, right: 2 })}`, result: { headers: {}, code: 200, body: 3 }},
    { command: `-e plus --cwd ./suites/basic -d ./math -b ${JSON.stringify({ left: 1, right: 2 })}`, result: expect.objectContaining({ body: 3})},
  ])(`${chalk.green("raio $command")} to match $result`, async ({command, opts, result}) => {
    const {stdout} = await execaCommand(`yarn raio ${command}`, opts)
    expect(JSON.parse(stdout)).toEqual(result)
  })
})

describe("configuration", async () => {
  test.each([
    { command: `-e inspect`, opts: {cwd: './suites/config' }, result: expect.objectContaining({ body: { config: { TEST: 'hello' } } })},
    { command: `-e inspect -p ./preset.ts`, opts: {cwd: './suites/config' }, result: expect.objectContaining({ body: { config: { TEST: 'hello' } } })},
  ])(`${chalk.green("raio $command")} to match $result`, async ({command, opts, result}) => {
    const {stdout, failed, stderr, exitCode} = await execaCommand(`yarn raio ${command}`, opts)

    console.log('>>>', stdout)
  })
})
import commandLineArgs from 'command-line-args'
import commandLineUsage, { OptionDefinition } from 'command-line-usage'
import 'esbuild-register'
import { startServer } from './server'

const optionDefinitions: OptionDefinition[] = [
	{
		name: 'help',
		alias: 'h',
		type: Boolean,
		description: 'Display this usage guide.'
	},
	{
		name: 'dir',
		alias: 'd',
		multiple: true,
		type: String,
		description: 'directory of routes, can specify multiple times. Default is routes',
		typeLabel: '<dir>',
		defaultValue: ['./routes']
	},
	{
		name: 'cwd',
		type: String,
		description: 'directory to find config, context etc. Default to the current dir',
		defaultValue: process.cwd()
	},
	{
		name: 'esbuild-register',
		type: Boolean,
		alias: 'r',
		description: 'Enable esbuild-register to transform typescript automatically. Default true',
		defaultValue: true
	},
	{
		name: 'preset',
		type: String,
		alias: 'p',
		description: 'use one file to config instead of dir based config with `config`, `context` and `handler`. Point this to a file with all of needed export'
	},
	{
		name: 'execute',
		type: String,
		alias: 'e',
		description: 'execute one of those route, ignore all of adaptors'
	},
	{
		name: 'executeArgs',
		alias: 'g',
		type: String,
		description: 'will be parsed as JSON. Only be processed if execute is defined. \n Must go in the format of { headers: ..., body: ...}'
	}
]

const options = commandLineArgs(optionDefinitions)
if (options.help) {
	const usage = commandLineUsage([
		{
			header: 'Usage',
			content: 'raio <entry dir>'
		},
		{
			header: 'Options',
			optionList: optionDefinitions
		}
	])
	console.log(usage)
} else {
	; (async () => {
		await startServer({
			cwd: options.cwd as any,
			routeDirs: options.dir,
			preset: options.preset ? [options.preset] : [],
			execute: options.execute,
			executeArgs: options.executeArgs
		})
	})()
}
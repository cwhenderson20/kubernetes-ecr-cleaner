#!/usr/bin/env node

const yargs = require('yargs');
const ecrCleaner = require('../index');
const options = require('../lib/options');

const argv = yargs
	.options(options)
	.help('h')
	.alias('h', 'help')
	.wrap(null)
	.argv;

ecrCleaner(argv, (err, result) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}

	console.log(result);
	process.exit(0);
});

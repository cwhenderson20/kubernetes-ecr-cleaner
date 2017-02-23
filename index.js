const ecrCleaner = require('./lib/ecr-cleaner');
const options = require('./lib/options');

function runEcrCleaner(opts, callback) {
	const formattedOptions = formatOptions(opts);
	formattedOptions.yes = true;
	ecrCleaner(formattedOptions, callback);
}

function formatOptions(opts) {
	const formattedOptions = {};

	Object.keys(options).forEach((option) => {
		switch (options[option].type) {
			case 'boolean':
				formatBoolean(opts[options[option].alias], option);
				break;
			case 'array':
				formatArray(opts[options[option].alias], option);
				break;
			case 'number':
				formatNumber(opts[options[option].alias], option);
				break;
			default:
				break;
		}
	});

	return formattedOptions;

	function formatBoolean(val, opt) {
		if (val !== undefined && val !== null) {
			if (typeof val !== 'boolean') {
				throw new Error(`${camelCase(options[opt].alias)} must be type boolean`);
			}

			formattedOptions[camelCase(options[opt].alias)] = val;
		} else if (options[opt].demand) {
			throw new Error(`${camelCase(options[opt].alias)} must be defined`);
		} else if (Object.hasOwnProperty.call(options[opt], 'default')) {
			formattedOptions[camelCase(options[opt].alias)] = options[opt].default;
		}
	}

	function formatArray(val, opt) {
		if (val !== undefined && val !== null) {
			if (!Array.isArray(val)) {
				throw new Error(`${camelCase(options[opt].alias)} must be type array`);
			}

			formattedOptions[camelCase(options[opt].alias)] = val;
		} else if (options[opt].demand) {
			throw new Error(`${camelCase(options[opt].alias)} must be defined`);
		} else if (Object.hasOwnProperty.call(options[opt], 'default')) {
			formattedOptions[camelCase(options[opt].alias)] = options[opt].default;
		}
	}

	function formatNumber(val, opt) {
		if (val !== undefined && val !== null) {
			if (typeof val !== 'number') {
				throw new Error(`${camelCase(options[opt].alias)} must be type number`);
			}

			formattedOptions[camelCase(options[opt].alias)] = val;
		} else if (options[opt].demand) {
			throw new Error(`${camelCase(options[opt].alias)} must be defined`);
		} else if (Object.hasOwnProperty.call(options[opt], 'default')) {
			formattedOptions[camelCase(options[opt].alias)] = options[opt].default;
		}
	}
}

function camelCase(term) {
	const words = term.split('-');
	let camelCasedTerm = words[0];

	for (let i = 1; i < words.length; i++) {
		camelCasedTerm += words[i].charAt(0).toUpperCase() + words[i].slice(1);
	}

	return camelCasedTerm;
}

module.exports = runEcrCleaner;

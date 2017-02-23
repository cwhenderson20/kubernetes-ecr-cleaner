#!/usr/bin/env node

const util = require('util');
const async = require('async');
const debug = require('debug')('ecr-cleaner');

function ecrCleaner(options, callback) {
	const {
		getNamespaces,
		getActiveImages,
		getAllECRImages,
		filterActiveImages,
		filterImagesByDate,
		deleteImages,
	} = require('./methods')(options);

	async.auto({
		getNamespaces,
		getActiveImages: ['getNamespaces', getActiveImages],
		getAllECRImages: ['getActiveImages', getAllECRImages],
		filterActiveImages: ['getAllECRImages', filterActiveImages],
		filterImagesByDate: ['filterActiveImages', filterImagesByDate],
		deleteImages: ['filterImagesByDate', deleteImages],
	}, (err, results) => {
		if (err) {
			debug('Cleanup failed');
			return callback(err);
		}

		if (results.deleteImages) {
			debug('Cleanup succeeded. Nothing to delete');
		} else {
			debug(`Cleanup succeeded. Results: ${util.inspect(results.deleteImages, { depth: null, colors: true, })}`);
		}

		callback(results.deleteImages);
	});
}

module.exports = ecrCleaner;

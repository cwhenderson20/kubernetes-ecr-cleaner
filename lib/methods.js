const exec = require('child_process').exec;
const async = require('async');
const AWS = require('aws-sdk');
const debug = require('debug')('ecr-cleaner');
const moment = require('moment');

function lib(options) {
	AWS.config.update({ region: 'us-east-1', });

	const ecr = new AWS.ECR();

	function getNamespaces(cb) {
		debug('Fetching namespaces');
		exec('kubectl get namespaces -o jsonpath=\'{.items[*].metadata.name}\'', (err, stdout) => {
			if (err) {
				debug('Error fetching namespaces');
				return cb(err);
			}

			debug('Fetched namespaces');

			if (!stdout) {
				return cb();
			}

			const namespaces = stdout.split(' ').filter((namespace) => options.excludeNamespaces.indexOf(namespace) === -1);

			debug(`Matching namespaces: ${namespaces}`);

			cb(null, namespaces);
		});
	}

	function getActiveImages(results, cb) {
		const namespaces = results.getNamespaces;
		const imagesByRepoName = {};

		if (!namespaces || namespaces.length === 0) {
			debug('No namespaces matched; not fetching pods');
			return cb();
		}
		debug('Fetching pods');
		async.each(namespaces, fetchNamespacePods, (err) => {
			if (err) {
				return cb(err);
			}

			cb(null, imagesByRepoName);
		});

		function fetchNamespacePods(namespace, fetchCb) {
			debug(`Fetching pods for namespace: ${namespace}`);
			exec(`kubectl get pods -n ${namespace} -o jsonpath='{.items[*].spec.containers[*].image}'`, (err, stdout) => {
				if (err) {
					debug(`Error fetching pods for namespace: ${namespace}`);
					return fetchCb(err);
				}

				debug(`Fetched pods for namespace: ${namespace}`);

				const images = stdout.split(' ').filter((image) => {
					const imageInfo = parseImageInfo(image);
					return options.excludeRepos.indexOf(imageInfo.repoName) === -1;
				}).map((image) => parseImageInfo(image));

				debug(`Matching images: \n${JSON.stringify(images, null, 2)}`);

				images.forEach((image) => {
					if (imagesByRepoName[image.repoName]) {
						imagesByRepoName[image.repoName].push(image.imageTag);
					} else {
						imagesByRepoName[image.repoName] = [image.imageTag];
					}
				});

				fetchCb();
			});
		}
	}

	function getAllECRImages(results, cb) {
		const activeImagesByRepo = results.getActiveImages;
		const allImagesByRepo = {};

		if (!activeImagesByRepo || Object.keys(activeImagesByRepo).length === 0) {
			debug('No active images');
			return setImmediate(cb);
		}

		async.eachOf(
			activeImagesByRepo,
			(activeImageIds, repositoryName, eachCb) => listImages(repositoryName, null, eachCb),
			(err) => {
				if (err) {
					return cb(err);
				}

				cb(null, allImagesByRepo);
			}
		);

		function listImages(repositoryName, nextToken, listCb) {
			ecr.listImages({ repositoryName, nextToken, }, (err, data) => {
				if (err) {
					return listCb(err);
				}

				if (data && data.imageIds) {
					if (allImagesByRepo[repositoryName]) {
						allImagesByRepo[repositoryName].concat(data.imageIds);
					} else {
						allImagesByRepo[repositoryName] = data.imageIds;
					}
				}

				if (data.nextToken) {
					return listImages(repositoryName, data.nextToken, listCb);
				}

				listCb();
			});
		}
	}

	function filterActiveImages(results, cb) {
		const activeImagesByRepo = results.getActiveImages;
		const allImagesByRepo = results.getAllECRImages;
		const filteredImagesByRepo = {};

		if (!activeImagesByRepo || Object.keys(activeImagesByRepo).length === 0) {
			debug('No active images, skipping filter by active images step');
			return setImmediate(cb);
		}

		Object.keys(allImagesByRepo).forEach((repo) => {
			allImagesByRepo[repo].forEach((image) => {
				if (activeImagesByRepo[repo].indexOf(image.imageTag) === -1) {
					if (filteredImagesByRepo[repo]) {
						filteredImagesByRepo[repo].push(image);
					} else {
						filteredImagesByRepo[repo] = [image];
					}
				}
			});
		});

		setImmediate(cb, null, filteredImagesByRepo);
	}

	function filterImagesByDate(results, cb) {
		const filteredImagesByRepo = results.filterActiveImages;
		const filteredImagesByRepoDesc = {};

		if (!filteredImagesByRepo || Object.keys(filteredImagesByRepo).length === 0) {
			debug('No active images, skipping filter by date step');
			return setImmediate(cb);
		}

		async.eachOf(filteredImagesByRepo, describeAllImages, (err) => {
			if (err) {
				return cb(err);
			}

			const dateFilteredImagesByRepo = {};

			Object.keys(filteredImagesByRepoDesc).forEach((repo) => {
				filteredImagesByRepoDesc[repo] = filteredImagesByRepoDesc[repo].reduce((acc, val) => acc.concat(val), []);
			});

			Object.keys(filteredImagesByRepoDesc).forEach((repo) => {
				filteredImagesByRepoDesc[repo].forEach((image, index) => {
					if (moment().diff(moment(image.imagePushedAt), 'days', true) >= options.days) {
						const imageTag = filteredImagesByRepo[repo][index].imageTag;

						if (imageTag !== 'latest') {
							if (dateFilteredImagesByRepo[repo]) {
								dateFilteredImagesByRepo[repo].push(imageTag);
							} else {
								dateFilteredImagesByRepo[repo] = [imageTag];
							}
						}
					}
				});
			});

			cb(null, dateFilteredImagesByRepo);
		});

		function describeAllImages(filteredImages, repositoryName, describeAllCb) {
			const describeImagesBatches = [];
			filteredImages = filteredImages.slice();

			while (filteredImages.length > 0) {
				describeImagesBatches.push(filteredImages.splice(0, 100));
			}

			async.mapSeries(describeImagesBatches, describeImages(repositoryName), (err, result) => {
				if (err) {
					return describeAllCb(err);
				}

				filteredImagesByRepoDesc[repositoryName] = result;
				describeAllCb();
			});
		}

		function describeImages(repositoryName) {
			return (imageIds, describeCb) => {
				const describeImagesParams = { repositoryName, imageIds, };

				ecr.describeImages(describeImagesParams, (err, data) => {
					if (err) {
						return describeCb(err);
					}

					describeCb(null, data.imageDetails);
				});
			};
		}
	}

	function deleteImages(results, cb) {
		const dateFilteredImagesByRepo = results.filterImagesByDate;

		if (!dateFilteredImagesByRepo || Object.keys(dateFilteredImagesByRepo).length === 0) {
			debug('No active images, skipping delete images step');
			return setImmediate(cb);
		}

		async.mapValues(dateFilteredImagesByRepo, batchDeleteImages, cb);

		function batchDeleteImages(imageTags, repositoryName, batchDeleteCb) {
			const batchDeleteParams = {
				imageIds: imageTags.map((imageTag) => ({ imageTag, })),
				repositoryName,
			};

			if (options.yes) {
				ecr.batchDeleteImage(batchDeleteParams, (err, data) => {
					if (err) {
						return batchDeleteCb(err);
					}

					batchDeleteCb(null, {
						failures: data.failures,
						imagesDeleted: data.imageIds,
						count: Object.keys(data.imageIds).length,
					});
				});
			} else {
				setImmediate(batchDeleteCb, null, {
					failures: [],
					imagesDeleted: batchDeleteParams.imageIds,
					count: batchDeleteParams.imageIds.length,
				});
			}
		}
	}

	return {
		getNamespaces,
		getActiveImages,
		getAllECRImages,
		filterActiveImages,
		filterImagesByDate,
		deleteImages,
	};
}

function parseImageInfo(image) {
	const podNameParts = image.split('/');
	const repoUrl = podNameParts.shift();
	const imageInfo = podNameParts.pop();
	const imageParts = imageInfo.split(':');
	const imageName = imageParts[0];
	const imageTag = imageParts[1];
	const repoName = `${podNameParts}/${imageName}`;

	return {
		repoUrl,
		repoName,
		imageName,
		imageTag,
	};
}

module.exports = lib;

module.exports = {
	r: {
		alias: 'repos',
		default: [],
		demand: false,
		description: 'Explicitly include ECR repositories',
		type: 'array',
	},
	e: {
		alias: 'exclude-repos',
		default: [],
		demand: false,
		description: 'Exclude ECR repositories from deletion',
		type: 'array',
	},
	x: {
		alias: 'exclude-namespaces',
		default: ['kube-system'],
		demand: false,
		description: 'Exclude namespaces from the pod search',
		type: 'array',
	},
	d: {
		alias: 'days',
		default: 90,
		demand: false,
		description: 'Max number of days to keep an unused image',
		type: 'number',
	},
	y: {
		alias: 'yes',
		default: false,
		demand: false,
		description: 'Commit to deletion',
		type: 'boolean',
	},
};

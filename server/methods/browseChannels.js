import { Meteor } from 'meteor/meteor';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import s from 'underscore.string';

const sortChannels = function(field, direction) {
	switch (field) {
		case 'createdAt':
			return {
				ts: direction === 'asc' ? 1 : -1,
			};
		default:
			return {
				[field]: direction === 'asc' ? 1 : -1,
			};
	}
};

const sortUsers = function(field, direction) {
	switch (field) {
		default:
			return {
				[field]: direction === 'asc' ? 1 : -1,
			};
	}
};

Meteor.methods({
	browseChannels({ text = '', type = 'channels', sortBy = 'name', sortDirection = 'asc', page, offset, limit = 10 }) {
		const regex = new RegExp(s.trim(s.escapeRegExp(text)), 'i');

		if (!['channels', 'users', 'federated_users'].includes(type)) {
			return;
		}

		if (!['asc', 'desc'].includes(sortDirection)) {
			return;
		}

		if ((!page && page !== 0) && (!offset && offset !== 0)) {
			return;
		}

		if (!['name', 'createdAt', 'usersCount', ...type === 'channels' ? ['usernames'] : [], ...type === 'users' ? ['username'] : []].includes(sortBy)) {
			return;
		}

		const skip = Math.max(0, offset || (page > -1 ? limit * page : 0));

		limit = limit > 0 ? limit : 10;

		const options = {
			skip,
			limit,
		};

		const user = Meteor.user();

		if (type === 'channels') {
			const sort = sortChannels(sortBy, sortDirection);

			if (!RocketChat.authz.hasPermission(user._id, 'view-c-room')) {
				return;
			}

			const results = RocketChat.models.Rooms.findByNameAndType(regex, 'c', {
				...options,
				sort,
				fields: {
					description: 1,
					topic: 1,
					name: 1,
					lastMessage: 1,
					ts: 1,
					archived: 1,
					usersCount: 1,
				},
			}).fetch();

			const total = RocketChat.models.Rooms.findByNameAndType(regex, 'c').count();

			return {
				results,
				total,
			};
		}

		// type === users
		if (!RocketChat.authz.hasPermission(user._id, 'view-outside-room') || !RocketChat.authz.hasPermission(user._id, 'view-d-room')) {
			return;
		}

		let methodToCall = 'findByActiveUsersExcept';

		if (type === 'federated_users') {
			methodToCall = 'findByFederatedActiveUsersExcept';
		}

		const sort = sortUsers(sortBy, sortDirection);

		const results = RocketChat.models.Users[methodToCall](text, [user.username], {
			...options,
			sort,
			fields: {
				username: 1,
				name: 1,
				createdAt: 1,
				emails: 1,
				federation: 1,
			},
		}).fetch();

		const total = RocketChat.models.Users[methodToCall](text, [user.username]).count();

		return {
			results,
			total,
		};
	},
});

DDPRateLimiter.addRule({
	type: 'method',
	name: 'browseChannels',
	userId(/* userId*/) {
		return true;
	},
}, 100, 100000);

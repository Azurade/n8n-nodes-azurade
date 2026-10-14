import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { apiRequest, flatten, isFinal } from './GenericFunctions';

export class AzuradeTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azurade Trigger',
		name: 'azuradeTrigger',
		icon: { light: 'file:../../icons/azurade.svg', dark: 'file:../../icons/azurade.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when a generation on your account finishes',
		subtitle: 'New generation',
		defaults: { name: 'Azurade Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'azuradeApi', required: true }],
		properties: [
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Images and Videos', value: '' },
					{ name: 'Images', value: 'image' },
					{ name: 'Videos', value: 'video' },
				],
				default: '',
				description:
					'Which finished generations start the workflow: from n8n, the web app or the API',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const qs: IDataObject = { status: 'completed', limit: 50 };
		const type = this.getNodeParameter('type') as string;
		if (type) qs.type = type;
		const { generations } = (await apiRequest.call(this, 'GET', '/api/v2/generations', { qs })) as {
			generations: IDataObject[];
		};
		// A job seen without its files would never fire with them, so it waits
		// for the next poll.
		const done = generations.filter(isFinal);

		if (this.getMode() === 'manual') {
			return done.length ? [[{ json: flatten(done[0]) }]] : null;
		}

		// New is what the previous poll did not see. The first poll only records
		// what it sees, so activating does not replay the history.
		const state = this.getWorkflowStaticData('node') as { seen?: string[] };
		const seen = new Set(state.seen);
		const first = state.seen === undefined;
		state.seen = done.map((g) => g.id as string);
		const fresh = done.filter((g) => !seen.has(g.id as string));
		if (first || fresh.length === 0) {
			return null;
		}
		return [fresh.map((g) => ({ json: flatten(g) }))];
	}
}

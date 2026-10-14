import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ResourceMapperField,
	ResourceMapperFields,
	ResourceMapperValue,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import type { Model } from './GenericFunctions';
import { apiRequest, BASE_URL, flatten, generationBody, isFinal, label } from './GenericFunctions';

// ponytail: fixed 5-second poll, one GET per running job per round; batch
// lookups if workflows start submitting hundreds of items at once.
const POLL_MS = 5000;

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

export class Azurade implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azurade',
		name: 'azurade',
		icon: { light: 'file:../../icons/azurade.svg', dark: 'file:../../icons/azurade.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate images and videos with Veo, Kling, Nano Banana and 40+ more models',
		defaults: { name: 'Azurade' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'azuradeApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Generation', value: 'generation' },
					{ name: 'File', value: 'file' },
					{ name: 'Account', value: 'account' },
				],
				default: 'generation',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['generation'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Generate an image or a video',
						action: 'Generate an image or a video',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a generation by ID',
						action: 'Get a generation',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get your generations, newest first',
						action: 'Get many generations',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['file'] } },
				options: [
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file to pass to a model as an input',
						action: 'Upload a file',
					},
				],
				default: 'upload',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get the account and its credit balance',
						action: 'Get the account',
					},
				],
				default: 'get',
			},

			// ---------------------------------------------------------- generation: create
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getModels' },
				required: true,
				default: '',
				displayOptions: show('generation', ['create']),
				description: `What each model costs: ${BASE_URL}/prices/. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.`,
			},
			{
				displayName: 'Parameters',
				name: 'parameters',
				type: 'resourceMapper',
				noDataExpression: true,
				required: true,
				default: { mappingMode: 'defineBelow', value: null },
				displayOptions: show('generation', ['create']),
				typeOptions: {
					loadOptionsDependsOn: ['model'],
					resourceMapper: {
						resourceMapperMethod: 'getModelFields',
						mode: 'add',
						addAllFields: true,
						supportAutoMap: false,
						fieldWords: { singular: 'parameter', plural: 'parameters' },
					},
				},
			},
			{
				displayName: 'Wait for Completion',
				name: 'wait',
				type: 'boolean',
				default: true,
				displayOptions: show('generation', ['create']),
				description:
					'Whether to wait until the generation finishes and output its files. Off, the node outputs the pending job right away.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: show('generation', ['create']),
				options: [
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'An https URL, such as a Webhook node, that receives the finished job as a POST instead of this node waiting for it',
					},
					{
						displayName: 'Timeout (Minutes)',
						name: 'timeout',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 15,
						description: 'How long to wait for the generation before failing the item',
					},
				],
			},

			// ---------------------------------------------------------- generation: get, getAll
			{
				displayName: 'Generation ID',
				name: 'generationId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('generation', ['get']),
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: show('generation', ['getAll']),
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				displayOptions: {
					show: { resource: ['generation'], operation: ['getAll'], returnAll: [false] },
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: show('generation', ['getAll']),
				options: [
					{
						displayName: 'Model Name or ID',
						name: 'model',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getModels' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Canceled', value: 'canceled' },
							{ name: 'Completed', value: 'completed' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Pending', value: 'pending' },
						],
						default: 'completed',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Image', value: 'image' },
							{ name: 'Video', value: 'video' },
						],
						default: 'image',
					},
				],
			},

			// ---------------------------------------------------------- file: upload
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				required: true,
				default: 'data',
				displayOptions: show('file', ['upload']),
				description:
					'The binary field holding the image, video or audio file. The output URL goes into a model parameter that takes a file.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { models } = (await apiRequest.call(this, 'GET', '/api/v2/models')) as unknown as {
					models: Model[];
				};
				return models.map((m) => ({ name: `${m.name} (${m.type})`, value: m.id }));
			},
		},
		resourceMapping: {
			// The chosen model's own parameters, as GET /api/v2/models/{id} lists them.
			async getModelFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const id = this.getNodeParameter('model', '') as string;
				if (!id) {
					return { fields: [], emptyFieldsNotice: 'Choose a model first' };
				}
				const model = (await apiRequest.call(
					this,
					'GET',
					`/api/v2/models/${encodeURIComponent(id)}`,
				)) as unknown as Model;
				return {
					fields: model.fields.map((f): ResourceMapperField => {
						const field: ResourceMapperField = {
							id: f.name,
							displayName: f.input ? `${label(f.name)} (${f.input} URL)` : label(f.name),
							required: f.required,
							defaultMatch: false,
							display: true,
							type: 'string',
						};
						if (f.enum) {
							field.type = 'options';
							field.options = f.enum.map((v) => ({ name: v, value: v }));
						} else if (f.type === 'boolean') {
							field.type = 'boolean';
						} else if (f.type === 'integer' || f.type === 'number') {
							field.type = 'number';
						}
						return field;
					}),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		// Submitted jobs this run still waits for, by item.
		const running: Array<{ item: number; id: string; deadline: number }> = [];
		const models = new Map<string, Model>();

		const fail = (item: number, error: Error) => {
			if (!this.continueOnFail()) {
				throw error;
			}
			out.push({ json: { error: error.message }, pairedItem: { item } });
		};

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			try {
				if (resource === 'generation' && operation === 'create') {
					const id = this.getNodeParameter('model', i) as string;
					if (!models.has(id)) {
						models.set(
							id,
							(await apiRequest.call(
								this,
								'GET',
								`/api/v2/models/${encodeURIComponent(id)}`,
								{},
								i,
							)) as unknown as Model,
						);
					}
					const mapped = this.getNodeParameter('parameters', i) as ResourceMapperValue;
					const options = this.getNodeParameter('options', i) as IDataObject;
					const body = generationBody(models.get(id)!, mapped.value ?? {});
					if (options.callbackUrl) body.callback_url = options.callbackUrl;
					const job = await apiRequest.call(this, 'POST', '/api/v2/generations', { body }, i);
					if (this.getNodeParameter('wait', i) as boolean) {
						const minutes = (options.timeout as number | undefined) ?? 15;
						running.push({
							item: i,
							id: job.id as string,
							deadline: Date.now() + minutes * 60_000,
						});
					} else {
						out.push({ json: job, pairedItem: { item: i } });
					}
				} else if (resource === 'generation' && operation === 'get') {
					const id = this.getNodeParameter('generationId', i) as string;
					const job = await apiRequest.call(
						this,
						'GET',
						`/api/v2/generations/${encodeURIComponent(id)}`,
						{},
						i,
					);
					out.push({ json: flatten(job), pairedItem: { item: i } });
				} else if (resource === 'generation' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i) as IDataObject;
					let cursor: string | undefined;
					let got = 0;
					do {
						const qs: IDataObject = { ...filters, limit: Math.min(100, limit - got) };
						if (cursor) qs.cursor = cursor;
						const page = await apiRequest.call(this, 'GET', '/api/v2/generations', { qs }, i);
						for (const job of page.generations as IDataObject[]) {
							out.push({ json: flatten(job), pairedItem: { item: i } });
							got++;
						}
						cursor = page.next_cursor as string | undefined;
					} while (cursor && got < limit);
				} else if (resource === 'file' && operation === 'upload') {
					const property = this.getNodeParameter('binaryPropertyName', i) as string;
					const binary = this.helpers.assertBinaryData(i, property);
					const buffer = await this.helpers.getBinaryDataBuffer(i, property);
					const form = new FormData();
					form.append(
						'file',
						new Blob([buffer], { type: binary.mimeType }),
						binary.fileName ?? 'file',
					);
					const upload = await apiRequest.call(
						this,
						'POST',
						'/api/v2/uploads',
						{ body: form, json: false },
						i,
					);
					out.push({ json: upload, pairedItem: { item: i } });
				} else if (resource === 'account' && operation === 'get') {
					out.push({
						json: await apiRequest.call(this, 'GET', '/api/v2/account', {}, i),
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				fail(i, error as Error);
			}
		}

		// Every item's job was submitted first, so they run side by side.
		while (running.length > 0) {
			await sleep(POLL_MS);
			for (const job of [...running]) {
				try {
					const now = await apiRequest.call(
						this,
						'GET',
						`/api/v2/generations/${job.id}`,
						{},
						job.item,
					);
					if (isFinal(now)) {
						running.splice(running.indexOf(job), 1);
						if (now.status !== 'completed') {
							// The credits are already refunded.
							throw new NodeOperationError(
								this.getNode(),
								(now.error as string) || `Generation ${now.status}`,
								{
									itemIndex: job.item,
								},
							);
						}
						out.push({ json: flatten(now), pairedItem: { item: job.item } });
					} else if (Date.now() > job.deadline) {
						running.splice(running.indexOf(job), 1);
						throw new NodeOperationError(
							this.getNode(),
							`Generation ${job.id} is still running. Read it later with Generation > Get, or raise the timeout.`,
							{ itemIndex: job.item },
						);
					}
				} catch (error) {
					fail(job.item, error as Error);
				}
			}
		}

		out.sort(
			(a, b) => (a.pairedItem as { item: number }).item - (b.pairedItem as { item: number }).item,
		);
		return [out];
	}
}

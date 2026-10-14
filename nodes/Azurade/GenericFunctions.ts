import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const BASE_URL = 'https://azurade.com';

type Context = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

// The public API (https://azurade.com/swagger/). Every error it answers is
// {"error": text, "code": snake_case}; the user sees that text.
export async function apiRequest(
	this: Context,
	method: IHttpRequestOptions['method'],
	path: string,
	options: Partial<IHttpRequestOptions> = {},
	itemIndex?: number,
): Promise<IDataObject> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'azuradeApi', {
		method,
		url: `${BASE_URL}${path}`,
		json: true,
		...options,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	})) as { statusCode: number; body: IDataObject | string };
	// A multipart request goes out with json off, so its answer arrives as text.
	const body: IDataObject =
		typeof response.body === 'string' ? jsonOrEmpty(response.body) : (response.body ?? {});
	if (response.statusCode < 400) {
		return body;
	}
	let message =
		typeof body.error === 'string' ? body.error : `Azurade answered ${response.statusCode}`;
	if (response.statusCode === 402) {
		message += `. Top up at ${BASE_URL}/pricing/`;
	}
	throw new NodeApiError(this.getNode(), body as JsonObject, {
		message,
		description: typeof body.code === 'string' ? body.code : undefined,
		httpCode: String(response.statusCode),
		itemIndex,
	});
}

// A proxy error page is not JSON; the status code then speaks for itself.
function jsonOrEmpty(text: string): IDataObject {
	try {
		return JSON.parse(text) as IDataObject;
	} catch {
		return {};
	}
}

// The model catalog is public, so the editor can list models and their
// parameters before a credential is attached to a freshly added node.
export async function getModels(this: ILoadOptionsFunctions): Promise<Model[]> {
	const { models } = (await this.helpers.httpRequest({
		url: `${BASE_URL}/api/v2/models`,
		json: true,
	})) as { models: Model[] };
	return models;
}

export async function getModel(this: ILoadOptionsFunctions, id: string): Promise<Model> {
	return (await this.helpers.httpRequest({
		url: `${BASE_URL}/api/v2/models/${encodeURIComponent(id)}`,
		json: true,
	})) as Model;
}

export interface ModelField {
	name: string;
	type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
	required: boolean;
	default?: string | number | boolean | null;
	enum?: string[];
	input?: 'image' | 'video' | 'audio' | null;
}

export interface Model {
	id: string;
	name: string;
	type: 'image' | 'video';
	fields: ModelField[];
}

export const label = (name: string) =>
	(name.charAt(0).toUpperCase() + name.slice(1)).replace(/_/g, ' ');

// A finished job as the next node sees it: the API's own body, plus the first
// file and every file at the top level for easy mapping. The input loses
// callback_url, which may be a private address.
export function flatten(job: IDataObject): IDataObject {
	const input = { ...((job.input as IDataObject) ?? {}) };
	delete input.callback_url;
	const outputs = (job.outputs as IDataObject[]) ?? [];
	return {
		...job,
		input,
		output_url: outputs[0]?.url ?? null,
		output_urls: outputs.map((o) => o.url),
		poster_url: outputs[0]?.poster_url ?? null,
	};
}

// The request body from the mapped parameters: empty ones are left out so the
// model's defaults apply, and a list field takes one URL, several separated by
// commas or new lines, or an array from an expression.
export function generationBody(model: Model, values: IDataObject): IDataObject {
	const body: IDataObject = { model: model.id };
	for (const field of model.fields) {
		let value = values[field.name];
		if (value === undefined || value === null || value === '') {
			continue;
		}
		if (field.type === 'array') {
			value = (Array.isArray(value) ? value : String(value).split(/[\n,]/))
				.map((v) => String(v).trim())
				.filter((v) => v !== '');
			if ((value as string[]).length === 0) {
				continue;
			}
		} else if (field.type === 'integer') {
			value = parseInt(String(value), 10);
		} else if (field.type === 'number') {
			value = parseFloat(String(value));
		} else if (field.type === 'boolean') {
			value = value === true || ['true', 'yes', '1'].includes(String(value).toLowerCase());
		}
		body[field.name] = value;
	}
	return body;
}

// A job is final once it failed, or completed with its files: they are
// attached a moment after the status turns completed.
export const isFinal = (job: IDataObject) =>
	job.status === 'completed'
		? ((job.outputs as unknown[]) ?? []).length > 0
		: job.status !== 'pending';

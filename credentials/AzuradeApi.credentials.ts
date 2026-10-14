import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AzuradeApi implements ICredentialType {
	name = 'azuradeApi';

	displayName = 'Azurade API';

	// The logo reads on both themes.
	icon: Icon = { light: 'file:../icons/azurade.svg', dark: 'file:../icons/azurade.svg' };

	documentationUrl = 'https://github.com/Azurade/n8n-nodes-azurade#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create one under API keys on your profile page at https://azurade.com/profile/. It starts with sk-.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://azurade.com',
			url: '/api/v2/account',
		},
	};
}

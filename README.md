# n8n-nodes-azurade

An n8n community node for [Azurade AI](https://azurade.com), which generates images and videos with over 40 models (Veo 3.1, Kling, Seedance, Nano Banana Pro, GPT Image, FLUX Kontext and others) from one credit balance. You pay per generation, credits never expire, and a failed generation is refunded automatically.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

In n8n, open **Settings > Community nodes**, click **Install** and enter `n8n-nodes-azurade`. The [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/) covers other ways to install it.

## Credentials

You need an Azurade account, which is free to create and comes with a few credits to try things out:

1. Sign in at [azurade.com/login](https://azurade.com/login/).
2. On your [profile page](https://azurade.com/profile/), create a key under **API keys** and copy it. It starts with `sk-` and is shown only once.
3. In n8n, create an **Azurade API** credential and paste the key.

The key spends your balance. You can delete it on the profile page at any time.

## Operations

**Azurade**

| Resource | Operation | What it does |
|---|---|---|
| Generation | Create | Generates an image or a video with the model you pick, and by default waits for the result |
| Generation | Get | Reads one generation by ID |
| Generation | Get Many | Lists your generations, newest first, filtered by status, model or type |
| File | Upload | Uploads a binary file (image, video or audio) so a model can take it as an input |
| Account | Get | Your account and its credit balance |

**Azurade Trigger** starts a workflow when a generation on your account finishes, whether it came from n8n, the web app or the API. It checks on n8n's polling schedule, and you can limit it to images or videos.

The Azurade node can also be used as a tool by n8n's AI Agent.

## Usage

### Generating

Pick a model and its parameters appear below it, read from the model's own definition: the prompt, aspect ratio, resolution, duration and so on. Leave a parameter empty to use the model's default. Prices per model are on the [pricing page](https://azurade.com/prices/).

With **Wait for Completion** on (the default), the node submits every input item's generation first, then waits for all of them and outputs each finished job. An image usually takes 10 to 30 seconds, a video a few minutes. Each output item has:

- `output_url`: the first file, which downloads without a key
- `output_urls`: every file
- `poster_url`: a still frame, for videos
- `cost`: the credits the generation took

To save the file itself, add an **HTTP Request** node with the URL `{{ $json.output_url }}` and the response format set to File.

A generation that fails stops the item with the reason, and its credits are already back on your balance.

### Passing images, video or audio to a model

Parameters that take a file are labelled, for example **Image input (image URL)**. They take a public URL. For several files, separate the URLs with commas or put them on separate lines.

If the file comes from an earlier node as binary data, upload it first with **File > Upload**, then map its `url` into the parameter.

### Without waiting

Turn **Wait for Completion** off and the node outputs the pending job right away. You can read it later with **Generation > Get**, or set **Options > Callback URL** to a Webhook node's production URL, which receives the finished job as a POST.

### Example

Manual Trigger, then **Azurade** (Generation > Create, model `nano-banana-pro`, prompt `A lighthouse on a cliff at dusk, film photo`), then **HTTP Request** (`{{ $json.output_url }}`, response format File) gives you the image as binary data, ready for Google Drive, Slack or email.

## Compatibility

Tested with n8n 2.43. Needs no packages beyond n8n itself.

## Resources

- [Azurade API reference](https://azurade.com/swagger/) and [developer guide](https://azurade.com/developers/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: support@azurade.com

## License

[MIT](./LICENSE.md)

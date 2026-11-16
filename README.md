# interview-rescribe

Built for startup teams: practice better customer interviews and turn them into useful reports. Transcription runs locally on Apple Silicon—no paid transcription service needed. With LM Studio, reports can stay local too, keeping interview notes on your machine.

Transcribe an interview and create a Mom Test report:

```bash
interview-rescribe run interview.m4a
```

Rescribe saves the JSON transcript, formatted `.txt`, and `.report.md` beside the audio file.
On macOS Apple Silicon, transcription runs locally with MLX and shows chunk progress.

## Install

### Install from npm

```bash
npm install -g interview-rescribe
```

Requires Node.js 20 or newer.

### Install the current source checkout

From the cloned repository, build and pack the current source, then install that tarball:

```bash
npm install
npm run build
npm pack
npm install -g ./interview-rescribe-0.1.0.tgz
```

`npm pack` creates or refreshes the tarball in the repository directory. Run it again after
changes before reinstalling. To run from the checkout without a global install, use
`npm run dev -- run /path/to/interview.m4a`.

## First run

Run `interview-rescribe init` for guided setup. Choose a report provider and model, and optionally
enter a Hugging Face token for speaker labels. Or run `interview-rescribe run <audio>` directly:
it checks for required tools and asks before installing tools or downloading the speech model.

```bash
interview-rescribe doctor
interview-rescribe init
interview-rescribe run interview.m4a
```

Without a Hugging Face token, transcription continues without speaker labels. To use diarization,
accept the terms for [pyannote speaker diarization](https://huggingface.co/pyannote/speaker-diarization-community-1)
and provide a token.

## Report providers

- **OpenRouter:** cloud reports; requires an API key.
- **LM Studio:** local reports; start its local server and load a model.

Choose a provider with `init`, or configure/update it later:

```bash
interview-rescribe setup openrouter   # prompts for API key and model
interview-rescribe setup lmstudio     # saves the LM Studio model identifier
interview-rescribe setup huggingface  # prompts for diarization token
```

Each provider keeps its own model setting and API key. Setting up LM Studio does not replace your
OpenRouter model or key.

By default, Rescribe uses OpenRouter whenever an OpenRouter key is configured; otherwise it uses
LM Studio. On an interactive run with no key, Rescribe offers to configure OpenRouter; if you
decline, it uses LM Studio. Use `--provider lmstudio` or `--provider openrouter` to override the
choice for one run. An OpenRouter key is required to use OpenRouter. Before creating a report, the
CLI prints the provider, model ID, and endpoint it will use. The LM Studio model ID in `doctor` is
the one Rescribe sends to its server; ensure it matches the model loaded in LM Studio.

Credentials entered in setup are stored in `~/.config/rescribe/config.json` with owner-only
permissions. Environment variables override saved values:

| Variable | Purpose |
| --- | --- |
| `RESCRIBE_OPENROUTER_API_KEY` | OpenRouter key |
| `RESCRIBE_LMSTUDIO_URL` | LM Studio API URL (default `http://localhost:1234/v1`) |
| `HF_TOKEN` or `PYANNOTE_AUTH_TOKEN` | Hugging Face diarization token |

## Commands and options

| Command | Purpose |
| --- | --- |
| `interview-rescribe run <audio>` | Transcribe, format, and generate a report |
| `interview-rescribe doctor` | Show tools, cached speech model, and report provider configuration |
| `interview-rescribe init` | Guided initial configuration |
| `interview-rescribe setup <openrouter\|lmstudio\|huggingface>` | Add or update provider settings |
| `interview-rescribe format <file.json>` | Format an existing transcript |
| `interview-rescribe report <file.txt>` | Generate a report from an existing transcript |

Common `run` options:

```bash
--language French                 # set interview language (default: auto)
--speakers 2                      # expected speaker count
--no-diarize                      # do not label speakers
--no-report                       # stop after transcription and formatting
--provider openrouter|lmstudio    # choose report provider for this run
--report-model <id>               # choose report model
--names SPEAKER_00=Name ...       # set speaker names without prompting
-y, --yes                         # accept setup prompts/defaults
```

## Platform notes

Transcription is supported only on macOS with Apple Silicon and runs locally through
`mlx-qwen3-asr`. Linux, Intel Macs, and Windows are not supported. Reports can use OpenRouter or
LM Studio; use LM Studio if you want report generation to stay local too.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

MIT License.

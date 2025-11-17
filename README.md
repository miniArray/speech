# ElevenLabs TTS CLI

A simple, focused command-line tool for converting text to speech using ElevenLabs.

## Features

- Pipe text from stdin or provide as argument
- Voice selection via flags
- Output to file or pipe to audio players
- TypeScript with full type safety
- Configurable voice settings (stability, similarity)

## Prerequisites

### Option 1: Using Nix Flake with direnv (Recommended)

Automatically sets up the environment when you `cd` into the directory:

```bash
# First time setup
cd elevenlabs/cli
direnv allow

# Environment loads automatically!
# Copy the example env file and add your API key
cp .envrc.local.example .envrc.local
# Edit .envrc.local and add your ELEVENLABS_API_KEY
```

Or without direnv:

```bash
# Enter development shell with all dependencies
nix develop

# Or run directly
nix run . -- "Hello world" -o test.mp3
```

### Option 2: Manual Installation

Requires Bun or Node.js to be installed manually.

## Installation

```bash
bun install  # or npm install
bun run build  # or npm run build
bun link  # or npm link - Makes 'tts' command available globally
```

## Usage

### Basic Examples

```bash
# Pipe text and play with mpv
echo "Hello world" | tts | mpv -

# Save to file
echo "Hello world" | tts -o hello.mp3

# Provide text as argument
tts "Hello world" -o hello.mp3

# Use different voice
echo "Hello world" | tts -v "21m00Tcm4TlvDq8ikWAM" | mpv -
```

### Options

```
-v, --voice <id>         Voice ID (default: ErXwobaYiN019PkySvjV - Antoni)
-o, --output <file>      Output file (default: stdout for piping)
-m, --model <id>         Model ID (default: eleven_multilingual_v2)
-s, --stability <value>  Voice stability 0-1 (default: 0.5)
-S, --similarity <value> Similarity boost 0-1 (default: 0.75)
```

### Common Voice IDs

- `ErXwobaYiN019PkySvjV` - Antoni (default, male)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (female)
- `AZnzlk1XvdvUeBnXmlld` - Domi (female)
- `EXAVITQu4vr4xnSDxMaL` - Bella (female)
- `MF3mGyEYCl7XYWbV9V6O` - Elli (female)
- `TxGEqnHWrfWFTfGW9XjX` - Josh (male)

## Environment Setup

Set your ElevenLabs API key:

```bash
export ELEVENLABS_API_KEY="your-api-key-here"
```

## Examples

```bash
# Read from file and convert
cat document.txt | tts -o document.mp3

# Generate and play immediately
tts "This is a test" | mpv -

# Use different voice settings
echo "Dramatic reading" | tts -s 0.8 -S 0.9 -o dramatic.mp3

# Pipe from other commands
fortune | tts | mpv -
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run directly
npm start -- "Hello world" -o test.mp3
```

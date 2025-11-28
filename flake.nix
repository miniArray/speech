{
  description = "ElevenLabs CLI - Text-to-speech and speech-to-text tools";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Whisper model (declaratively managed)
        whisperModel = pkgs.fetchurl {
          url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
          hash = "sha256-kh5M+Ghv3Zk9zQgaXaW2w2W/3hFi5ysI11rHUomSCx8=";
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Audio recording (for STT)
            sox

            # Speech-to-text (whisper-cpp)
            whisper-cpp

            # Runtime
            bun

            # C++ standard library (required for ONNX Runtime / VAD)
            stdenv.cc.cc.lib

            # Optional: Node.js for compatibility
            nodejs_22
          ];

          shellHook = ''
            # Set library path for ONNX Runtime (VAD)
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH"

            # Whisper model path (declaratively managed by Nix)
            export WHISPER_MODEL_PATH="${whisperModel}"

            echo "🎙️  ElevenLabs CLI Development Environment"
            echo ""
            echo "Available tools:"
            echo "  - sox: Audio recording ($(sox --version 2>&1 | head -n1))"
            echo "  - whisper-cpp: Speech-to-text (local, offline)"
            echo "  - bun: Runtime ($(bun --version))"
            echo ""
            echo "Quick start:"
            echo "  bun install    # Install dependencies"
            echo "  bun run build  # Build both tts and stt"
            echo "  echo 'Hello' | bun dist/tts.js | mpv -"
            echo "  bun dist/stt.js  # Start speech-to-text (whisper-cpp)"
            echo ""
            echo "💡 STT now uses whisper-cpp (local, offline, fast!)"
            echo "💡 TTS still uses ElevenLabs API"
            echo ""

            # Check for API key (only needed for TTS now)
            if [ -z "$ELEVENLABS_API_KEY" ]; then
              echo "⚠️  ELEVENLABS_API_KEY not set (needed for TTS only)"
              echo "   Set it in .envrc.local or globally"
              echo ""
            else
              echo "✓ ELEVENLABS_API_KEY is set"
              echo ""
            fi
          '';
        };

        # Package the CLI application
        packages.default = pkgs.buildNpmPackage {
          pname = "elevenlabs-cli";
          version = "1.0.0";
          src = ./.;

          npmDepsHash = "sha256-X+Xzt3laOo/JebT6aSLFMUVTixeuPz4DE/rgPUdIbis=";

          nativeBuildInputs = [ pkgs.bun ];

          buildPhase = ''
            runHook preBuild
            bun build src/tts-index.ts --outfile dist/tts.js --target node
            bun build src/stt-index.ts --outfile dist/stt.js --target node
            chmod +x dist/*.js
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/bin $out/lib
            cp -r dist $out/lib/
            cp -r node_modules $out/lib/

            # Create TTS wrapper
            cat > $out/bin/tts <<EOF
#!/usr/bin/env bash
exec ${pkgs.bun}/bin/bun $out/lib/dist/tts.js "\$@"
EOF

            # Create STT wrapper
            cat > $out/bin/stt <<EOF
#!/usr/bin/env bash
export PATH="${pkgs.lib.makeBinPath [ pkgs.sox pkgs.whisper-cpp ]}:\$PATH"
export WHISPER_MODEL_PATH="${whisperModel}"
exec ${pkgs.bun}/bin/bun $out/lib/dist/stt.js "\$@"
EOF

            chmod +x $out/bin/tts $out/bin/stt
            runHook postInstall
          '';

          meta = {
            description = "Text-to-speech and speech-to-text CLI tools";
            license = pkgs.lib.licenses.mit;
          };
        };

        apps = {
          default = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/tts";
          };
          tts = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/tts";
          };
          stt = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/stt";
          };
        };
      }
    );
}

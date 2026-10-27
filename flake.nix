{
  description = "Format on save with the Spotless configuration of your Gradle or Maven build";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.treefmt-nix.flakeModule
        inputs.git-hooks.flakeModule
      ];

      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      perSystem =
        {
          config,
          pkgs,
          lib,
          system,
          ...
        }:
        let
          jdk = pkgs.jdk21;
          fixtures = "^test/integration/fixtures/";
          mvnd103 = {
            aarch64-darwin = {
              platform = "darwin-aarch64";
              hash = "sha256-tVKMktWw4UqKR93/E4wZ2TrAH2y4ooUU+PpA8s62UZQ=";
            };
            x86_64-linux = {
              platform = "linux-amd64";
              hash = "sha256-Pd1HQbDnDCRe0WS0V3S3KhkzEpSy1hR1cMjFJxqXfow=";
            };
          };
          mvndHome = version: home: {
            "MVND_HOME_${lib.replaceStrings [ "." ] [ "_" ] version}" = "${home}";
          };
          mvndRelease =
            version: release:
            pkgs.stdenv.mkDerivation {
              pname = "mvnd";
              inherit version;
              src = pkgs.fetchurl {
                url = "https://github.com/apache/maven-mvnd/releases/download/${version}/maven-mvnd-${version}-${release.platform}.tar.gz";
                inherit (release) hash;
              };
              nativeBuildInputs = lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
              dontConfigure = true;
              dontBuild = true;
              dontStrip = true;
              installPhase = ''
                runHook preInstall
                cp -r . $out
                runHook postInstall
              '';
            };
        in
        {
          treefmt = {
            projectRootFile = "flake.nix";
            programs.nixfmt.enable = true;
          };

          pre-commit.settings.hooks = {
            treefmt = {
              enable = true;
              package = config.treefmt.build.wrapper;
            };

            gitleaks = {
              enable = true;
              entry = "${pkgs.writeShellScript "gitleaks-files" ''
                status=0
                for file in "$@"; do
                  ${pkgs.gitleaks}/bin/gitleaks dir --config .gitleaks.toml --redact --verbose --no-banner --log-level warn "$file" || status=1
                done
                exit $status
              ''}";
              args = [ ];
              pass_filenames = true;
            };

            convco.enable = true;

            end-of-file-fixer = {
              enable = true;
              excludes = [ fixtures ];
            };
            trim-trailing-whitespace = {
              enable = true;
              excludes = [ fixtures ];
            };
            check-merge-conflicts = {
              enable = true;
              args = [ "--assume-in-merge" ];
            };
            check-added-large-files = {
              enable = true;
              args = [ "--enforce-all" ];
              excludes = [ "^images/format-on-save\\.gif$" ];
            };
            detect-private-keys.enable = true;

            typos = {
              enable = true;
              files = "\\.md$";
            };
            markdownlint = {
              enable = true;
              excludes = [ "^CHANGELOG\\.md$" ];
              settings.configuration = {
                default = true;
                MD013 = false;
                MD024.siblings_only = true;
                MD031.list_items = false;
                MD033 = false;
                MD060 = false;
              };
            };

            jactionlint = {
              enable = true;
              name = "jactionlint";
              package = pkgs.jactionlint;
              entry = "${lib.getExe pkgs.jactionlint} --shellcheck=${lib.getExe pkgs.shellcheck} --pyflakes=${lib.getExe pkgs.python3Packages.pyflakes}";
              files = "^\\.github/(workflows/([^/]+\\.ya?ml|actions\\.lock)|dependabot\\.ya?ml)$";
            };
          };

          devShells.default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.pnpm
              jdk
              (pkgs.maven.override { jdk_headless = jdk; })
              pkgs.mvnd
            ]
            ++ config.pre-commit.settings.enabledPackages;

            shellHook = config.pre-commit.shellHook;

            env = {
              JAVA_HOME = "${jdk.home}";
              JAVA_HOME_17 = "${pkgs.jdk17.home}";
              JAVA_HOME_25 = "${pkgs.jdk25.home}";
            }
            // mvndHome pkgs.mvnd.version "${pkgs.mvnd}/mvnd-home"
            // lib.optionalAttrs (mvnd103 ? ${system}) (
              mvndHome "1.0.3" (mvndRelease "1.0.3" mvnd103.${system})
            );
          };
        };
    };
}

{
  description = "vscode-spotless-for-gradle-and-maven dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.treefmt-nix.flakeModule ];

      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      perSystem =
        {
          pkgs,
          lib,
          system,
          ...
        }:
        let
          jdk = pkgs.jdk21;
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

          devShells.default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.pnpm
              jdk
              (pkgs.gradle.override { java = jdk; })
              (pkgs.maven.override { jdk_headless = jdk; })
              pkgs.mvnd
            ];

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
